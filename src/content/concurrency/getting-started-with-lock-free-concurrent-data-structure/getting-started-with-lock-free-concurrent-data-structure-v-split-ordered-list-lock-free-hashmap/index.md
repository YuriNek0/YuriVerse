---
title: Getting started with lock-free concurrent data structure V - Split Ordered list (Lock-free Hashmap)
pubDate: 2025-03-06
---

## Abstract

A hashmap is an efficient algorithm with an average time complexity of O(1). When it comes to multithreading, it can be lock-free if the key and elements are atomic variables. However, a hashmap would grow its size when its count of elements and size's ratio exceeds the load factor, which is not an atomic process.

Hence, to make it thread-safe, we need to make sure no threads can access the hashmap when its elements are moving. However, it is not efficient, and not lock-free.&#x20;

The idea split ordered list is to eliminate the process of moving elements, which means the elements' location is fixed. But it divides elements into different logical _**buckets**_, which contains elements' addresses. All elements in a bucket has the same hash value in some bits.

## Array of buckets

To lookup for a key, a hashmap would use the hash value, as an index, to find the exact element. Hence, even if we divided elements to the buckets, the bucket itself still need to be stored in an array, which is still not atomic.&#x20;

The original paper uses indirection to access the buckets. It introduces a Segment structure, with a fixed size.&#x20;

Each Segment consist of addresses of Sub-Segment, which is also fixed. Initially, we only have a Segment with no sub-segment (NULL). The Sub-Segment will only be allocated when we need to access it and it has not be initialized (Reduces memory usage).&#x20;

If have L layers of Sub-Segment, and every Segment is an array of size N, we can have `pow(N, L)` elements stored in the structure.

This idea is the same as the [Page Table](https://en.wikipedia.org/wiki/Page_table) in Operating System.

## Make the array actually growable

{% content-ref url="getting-started-with-lock-free-concurrent-data-structure-iv-growable-array.md" %}
[getting-started-with-lock-free-concurrent-data-structure-iv-growable-array.md](getting-started-with-lock-free-concurrent-data-structure-iv-growable-array.md)
{% endcontent-ref %}

We can use the structure in my previous post as a growable array.

## Total-order of elements

To make elements stay in their position without moving, a total order of hash values in a container structure is needed. That order needs:

* When the size of hashmap increases, the order should always be the same. No matter what the new hash value would be (offset = hashcode % size).
* Items with the same hashcode should be close to each other. (In one bucket)

## Partial hash-value in buckets

A perfect candidate for such an order is the reversed bits of the hashcode. When we choose a size of power of 2, whenever we grow the hashmap by doubling its size, the new offset is (hashcode % (size \* 2).&#x20;

Since size is already a power of 2, this operation will be equivalent to adding a new bit of the original hashcode.

Example:

* Size: 2
* Element hashcodes: {01011011}, {10101101}
* Reversed: 11011010, 10110110
* Current hashcode: 1, 1
* Increasing size to 4
* New hashcode: 11, 10 (Appending a new byte)

Hence, we can store the original hashcode directly, without modding. Thus we do not need to calculate new hashcodes. And the order of these variables will be automatically maintained. All elements sharing the same effective hashcode (modded) belongs to the same bucket.&#x20;

(For size 2, these two elements belongs to the same **bucket**, but for size 4, the elements' **bucket** would become 11 and 10 correspondingly)

An element can belong to multiple buckets. For a reversed hashcode of 11010111, it can belong to Bucket 1, 11, 110, 1101, 1101, 110101, 1101011.

## Query

### Buckets

A Linked list is a perfect structure for such design. The reference of its nodes can easily be put into an array.&#x20;

Yet elements in the hashmap may be deleted. So, whenever we create a bucket, we will add a sentinel node to the hashmap and mark it with a 0 in the least significant bit (reversed value, such as 11111110).&#x20;

For nodes with items, the least significant bit is 1. (Hence we can make sure a bucket is always the first node of all elements sharing the same effective hash value)

### Finding and initializing buckets

Whenever we want to query for a value, we first start to look for its bucket. If that bucket does not exist, it will initialize it by inserting the new bucket's sentinel node into the ordered linked list.

The quickest way to find the position of where the new bucket would go, is to find its parent bucket, which is the bucket **before the increase of size.**

And if the parent bucket still not exist, it will recursively initialize them, until it finds a parent bucket. (The _root_ bucket has a hashcode of 0 so it can always be reached)

After the initialization, we can safely insert the sentinel node into the bucket array, to make the lookup process faster. (Most cases, O(1))

### Finding elements

After we get the hashcode of the element, we will try to find its corresponding bucket.&#x20;

A bucket of an element is the nearest position that can reach it from the linked list. From the bucket, we will do a linear traversal of the linked list, until we reached the element and return, or hit a reversed hashcode that is larger than the expected value, meaning the element does not exist.

This way, we can safely have a lock-free access of hashmap, without ever moving elements or buckets.

### Inserting/Deleting

The insertion and deletion are similar to the finding process. But after we insert/delete an element on the linked list after its bucket, we need to check if the hashmap satisfies its minimum/maximum load factor threshold, and we need to adjust the size of it.

## Code

```rust
fn lookup_bucket<'s>(
    &'s self,
    key: usize,
    guard: &'s Guard,
    ) -> Cursor<'s, usize, MaybeUninit<V>> {
    let index = key & (usize::MAX >> 1);
    let bucket_ptr_ref = self.buckets.get(index, guard);
    let bucket_ptr = bucket_ptr_ref.load(Acquire, guard);
    // println!("Trying index: {}", index);
    if !bucket_ptr.is_null() {
        // println!("Found Index: {}", index);
        return Cursor::new(bucket_ptr_ref, bucket_ptr);
    }
    
    // Eliminate left-most 1
    let mut parent_mask = key;
    let mut size_usize = std::mem::size_of::<usize>();
    for sz in (0..size_usize).rev() {
        // println!("Squashing {} = {}", sz, parent_mask);
        parent_mask |= parent_mask >> sz;
    }
    // println!("Squashed = {}", parent_mask);
    parent_mask ^= parent_mask >> 1;
    // println!("Left most 1 = {}", parent_mask);
    parent_mask -= 1;
    // println!("Parent_mask = {}", parent_mask);
    
    let mut prev_bkt = self.lookup_bucket(key & parent_mask, guard);

    let index = index.reverse_bits();
    let mut node = Owned::from(Node::new(index, MaybeUninit::uninit()));
    loop {
        let mut bkt = prev_bkt.clone();
        if let Ok(r) = bkt.find_harris_michael(&index, guard) {
            if r {
                bucket_ptr_ref.store(bkt.curr(), Release);
                return bkt;
            }

            if let Err(e) = bkt.insert(node, guard) {
                node = e;
            } else {
                // Safety: If insert successful, next bkt finding should always be successful
                node = unsafe { Owned::from_raw(ptr::null_mut()) };
            }

            // println!("Bucket: Invalid cursor. Retry.")
        }
    }
}

/// Moves the bucket cursor returned from `lookup_bucket` to the position of the given key.
fn find<'s>(
    &'s self,
    key: &usize,
    guard: &'s Guard,
) -> (bool, Cursor<'s, usize, MaybeUninit<V>>) {
    let size = self.size.load(Relaxed);

    let bkt_cursor = self.lookup_bucket(key & (size - 1), guard);
    // println!("Found bkt: {} {bkt_cursor:?}", key & (size-1));
    let key = key.reverse_bits() | 1;
    loop {
        let mut cur = bkt_cursor.clone();
        if let Ok(result) = cur.find_harris_michael(&key, guard) {
            return (result, cur);
        }
        // println!("Find: Invalid cursor. Retry.")
    }
}

fn insert(&self, key: usize, value: V, guard: &Guard) -> Result<(), V> {
    Self::assert_valid_key(key);

    // println!("Insert {}", key);
    let size = self.size.load(Relaxed);
    let bkt_cursor = self.lookup_bucket(key & (size - 1), guard);
    let key = key.reverse_bits() | 1;
    let mut n = Owned::new(Node::new(key, MaybeUninit::new(value)));

    loop {
        // println!("Trying to insert: 0x{key:2X} Find: Result: {r} Cursor: {cur:?}");
        let mut cur = bkt_cursor.clone();
        let Ok(mut r) = cur.find_harris_michael(&key, guard) else {
            // println!("Insert: Invalid cursor. Retry.");
            continue;
        };
        if r {
            // println!("Insertion Failed. Key exist.");
            return unsafe { Err(n.into_box().into_value().assume_init()) };
        }
        if let Err(ret) = cur.insert(n, guard) {
            // println!("Insertion Failed. ret: {ret:?}, Retrying");
            n = ret;
            continue;
        }
        // println!("Inserted into {cur:?}");

        let count = self.count.fetch_add(1, Relaxed);
        if count + 1 > size * Self::LOAD_FACTOR {
            let _ = self
                .size
                .compare_exchange(size, size << 1, Relaxed, Relaxed);
            // println!("SIZE GROW: {}", size << 1);
        }

        return Ok(());
    }
}

fn delete<'a>(&'a self, key: &usize, guard: &'a Guard) -> Result<&'a V, ()> {
    Self::assert_valid_key(*key);

    // println!("Delete {}", key);
    let size = self.size.load(Relaxed);
    let bkt_cursor = self.lookup_bucket(key & (size - 1), guard);
    let key = key.reverse_bits() | 1;

    loop {
        let mut cur = bkt_cursor.clone();
        let Ok(mut r) = cur.find_harris_michael(&key, guard) else {
            // println!("Delete: Invalid cursor. Retry.");
            continue;
        };
        if !r {
            return Err(());
        }
        if let Ok(v) = cur.delete(guard) {
            self.count.fetch_sub(1, Relaxed);
            return unsafe { Ok(v.assume_init_ref()) };
        }
        // println!("Delete failed {}", key);
    }
}

```

## References

* Split-ordered lists: Lock-free extensible hash tables [https://doi.org/10.1145/1147954.1147958](https://doi.org/10.1145/1147954.1147958)
* Wikipedia - Page table [https://en.wikipedia.org/wiki/Page\_table](https://en.wikipedia.org/wiki/Page_table)
