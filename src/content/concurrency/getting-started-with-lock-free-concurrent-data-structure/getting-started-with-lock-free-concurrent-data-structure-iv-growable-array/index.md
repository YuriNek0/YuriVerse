---
title: Getting started with lock-free concurrent data structure IV - Growable array
pubDate: 2025-03-06
---

## Abstract

The structure in introduced by [CS431 of KAIST](https://github.com/kaist-cp/cs431). It is a module of the lock-free hashmap homework. The design of the hashmap itself can be found in my next post ([Split Ordered list](getting-started-with-lock-free-concurrent-data-structure-v-split-ordered-list-lock-free-hashmap.md)).&#x20;

When multiple threads are trying to operate on an array, it may not have enough space for data to fill in. But the operation of growing its size is not atomic, which means one thread needs to grow the array while other threads needs to be halted.

This is inefficient, and copying an array is costly in time bound. This post will introduce a growable array structure that does not move the data underlying the array, achieving atomicity of _growing_.

## Indirection

Allocating a large array where most spaces may not be used is greatly inefficient. An example of that is memory address mapping.&#x20;

If we want to divide memory addresses into parts, and map each part to the actual location of the memory ([Page Table](https://en.wikipedia.org/wiki/Page_table)), an array to map these regions is needed.

However, most regions of addresses may not be used, but the mapping table itself still occupies a large amount of memory space, which is not favorable.

<figure>

![](<./assets/image (4) (1).png>)

<figcaption><p>Image from <a href="https://en.wikipedia.org/wiki/Page_table">Wikipedia</a></p></figcaption></figure>

If we have a 4GB memory with 32-bits address, and we want to map each region of 4KB into a table, we need 4GB/4KB = 1M slots, and each slot needs 32-bits (4 Bytes). Hence the array would occupies 1M \* 4 B= 4MB.

In most OS running on modern CPU, each program needs a table of mapping. If we allocate 4MB to each program, it will waste a large amount of space.

Indirection is a solution to this problem. It divides memory even further. If the memory region is still 4KB, we can divide that 4MB table into smaller parts, and if some region of that 4MB table is not used, we do not need to allocate them.

<figure>

![](<./assets/image (5) (1).png>)

<figcaption><p>Image from <a href="https://wiki.osdev.org/Paging">OSDev</a></p></figcaption></figure>

So, instead of allocate a large array at once, we can use a smaller array (4KB), in which we can have 4KB/4 = 1K slots. And, in that 1K slots, we can still store 1K/4 = 256 addresses. Finally, those address reached the 4KB region that we want.

The result is tremendous. Suppose we have a program uses 16MB of memory, it needs 16MB / 4KB = 4K slots, which needs 16K of memory. That 16K memory can fit into 16K / 4K = 4 slots of the first layer of that smaller array, but we have 256 addresses available!

In the most optimal case, it only costs 16KB + 4KB = 20KB, reducing the cost of space from 4MB to 20KB!

## Growing by indirection

Indirection is highly resemble to a tree structure. So why don't we transform that into a real dynamic tree structure? By that we can make that array infinitely growable.

To transform it into a tree structure, we need to distinguish leaf nodes and internal nodes, and we can make leaf nodes to be the array storing the elements, and internal nodes to be the slot storing addresses of nodes below.

## Segment

A segment in this design is similar to a tree structure. Suppose you will have 10 elements in each region, then it will be equivalent to a tree with 10 degrees.

At first, there will be only a root node with height 0. Then, after the insertion of the first node, the array of height 1 is created.&#x20;

<figure>

![](<./assets/image (6).png>)

<figcaption><p>Source from KAIST CS431</p></figcaption></figure>

Note that we are applying offsets by using some bits of an _address_.

But when it needs to increase its height (The address is large than what the maximum capacity of the current tree), instead of allocating a new array and updating height information in each layer, the algorithm creates a new array as new first-layer, store the original root's address to 0, and compare\_exchange it with root.

(As for why it is storing to 0, when an address is too large and the tree needs to increase its height, all of the previous nodes' address must be smaller than the  new node's address, so that the new node's address needs more bits to represent its value. Hence for all previous addresses, to extend bits without affecting their values, we need to add 0 before them.)&#x20;

<figure>

![](<./assets/image (1) (1).png>)

<figcaption><p>Source from KAIST CS431</p></figcaption></figure>

Another case is when we do not need to increase its height, but we need to allocate a new node. In this case, we can have a new node ready, and compare\_exchange the parent node to have it inserted to the structure.

<figure>

![](<./assets/image (2) (1).png>)

<figcaption><p>Source from KAIST CS431</p></figcaption></figure>

All pointers in a node must be an atomic pointer variable. Otherwise it would be impossible to make the structure be lock-free.

<figure>

![](<./assets/image (3) (1).png>)

<figcaption><p>Source from KAIST CS431</p></figcaption></figure>

## Code

```rust
let mut mask = (1 << SEGMENT_LOGSIZE) - 1;
let mut height = 0;
while index & mask != index {
    height += 1;
    mask = mask << SEGMENT_LOGSIZE | mask;
}

if height > (std::mem::size_of::<usize>() << 3) / SEGMENT_LOGSIZE {
    panic!(
        "growable_array::get : Index overflow. {height} > {}. Idx: 0x{:02x}",
        (std::mem::size_of::<usize>() << 3) / SEGMENT_LOGSIZE,
        index
    );
}

// Create segments bottom-up
let mask =
    ((1usize << SEGMENT_LOGSIZE) - 1).wrapping_shl((SEGMENT_LOGSIZE * height) as u32);
fence(Acquire);
for layer in (0..height).rev() {
  
    let ptr = self.root.load(Relaxed, guard);
    if ptr.tag() >= height {
        break;
    }
    let mut new_segment = Segment::<T>::new().with_tag(ptr.tag() + 1);
    unsafe { new_segment.children[0] = Atomic::from(ptr) };
    let _ = self
        .root
        .compare_exchange(ptr, new_segment, AcqRel, Acquire, guard);
}

// Locate element top-down
let mut atm_ptr = &self.root;
let mask = (1 << SEGMENT_LOGSIZE) - 1;
let mut ptr = atm_ptr.load(Acquire, guard);
unsafe {
    for layer in (0..=ptr.tag()).rev() {
        let offset = (index >> (SEGMENT_LOGSIZE * layer)) & mask;
        // println!("Index: 0x{:2X}, Offset: 0x{:2X}, Mask: 0x{:2X}", index, offset, mask);
        if !ptr.is_null() {
            if layer == 0 {
                return &ptr.as_ref().unwrap().elements[offset];
            }
            // println!("Layer: {layer}, Prev Ptr: {atm_ptr:?}");
            atm_ptr = &ptr.as_ref().unwrap().children[offset];
            // println!("Layer: {layer}, Goto Ptr: {atm_ptr:?}");
        } else {
            // println!("Layer: {layer}, Prev Ptr: {atm_ptr:?}");
            let new_segment = Segment::<T>::new().with_tag(layer);
            let res = atm_ptr.compare_exchange(ptr, new_segment, AcqRel, Acquire, guard);
            // println!("Layer: {layer}, Allocated Ptr: {atm_ptr:?}");
            if layer == 0 {
                return &atm_ptr.load(Relaxed, guard).as_ref().unwrap().elements[offset];
            }
            atm_ptr = &atm_ptr.load(Relaxed, guard).as_ref().unwrap().children[offset];
            // println!("Layer: {layer}, Goto Ptr: {atm_ptr:?}");
        }
        ptr = atm_ptr.load(Relaxed, guard);
    }
}

panic!("growablearray_get: possible overflow of layers.");

```

## References

1. KAIST CS431 course and homework - [https://github.com/kaist-cp/cs431/](https://github.com/kaist-cp/cs431/)
2. Wikipedia - Page Table [https://en.wikipedia.org/wiki/Page\_table](https://en.wikipedia.org/wiki/Page_table)
3. OSDev - Paging [https://wiki.osdev.org/Paging](https://wiki.osdev.org/Paging)

