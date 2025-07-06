---
title: Getting started with lock-free concurrent data structure VI - Hazard Pointer
pubDate: 2025-03-06
---

## Abstract

Almost all lock-free structures have a flaw that will cause race condition - ABA problem. To mitigate that, we need to have a mechanism to protect the data underlying the pointer.

But that mechanism must also be lock-free, otherwise the lock-free structure would still has a lock in place.

Hazard pointer is used to mark a pointer as **being used**. This way, two threads can coordinate with each other by this mechanism to prevent race condition from happening.

## Use-After-Free

In most cases, lock-free data structures will have risks of UAF. For instance, thread A gets a pointer of that block, while thread B is trying to free that block. After the block is freed, A tries to read it again, causing use-after-free.

This is very common in lock-free structure if not careful, especially when it comes to moving pointers.

## ABA Problem

ABA Problem is a special case for UAF. Still use the example above, this time, thread B freed that block first, while thread A still have that pointer in use.&#x20;

After that, there is a thread C who wants to insert a block into the structure, and since every block has the same size by design (same struct for nodes), it will **highly likely** to be allocated with what was freed by B.

Then C writes some other values and pointers, and then A, without awareness, tries to compare\_exchange it with the old pointer value — which is still the same block but it is overwritten by C, and A neglected that fact and put it to somewhere else on that structure, causing inconsistency.

Another example is, in a linked list, when A get the head value and its next pointer, and then B remove the head node, C put another node into a linked list, and after that, another thread D allocated a new node that has the same address of what A's _head_ has, and D pointed to somewhere else.

A does not aware of that, and do a compare\_swap(\&head, head, next). But that next pointer is already being freed by B. This is hazardous.

## Deferred reclamation

Therefore, a way to mitigate that is to delay the freeing process, such that a block can only be freed after all threads are not using it. This process is called **deferred reclamation**.

Thus, in the example above, D cannot get a new node that shares any blocks that is currently in use by other threads, because they have not been freed!&#x20;

## Hazard pointer

In hazard pointer, instead of freeing a pointer, it introduces another concept called **retire**. A retired pointer is no longer in use by this thread and needs to be freed later on.&#x20;

But only after all threads stopped to use that pointer, it shall be freed.

## Protected pointer blocks

To achieve that, a global set of pointer slot is needed to keep track of all pointers that maybe in use. We will use an insert-only linked list as slots.

Every slot will have a flag marking a pointer is being used or not, and we can have multiple slots containing the same pointer address. (So that each thread will have exclusive access to a slot)

When a thread trying to mark a pointer as **hazardous**, it will iterate through the linked-list, and compare\_exchange its flag by false with true. If succeed, it will have an exclusive access to that slot. This is similar to the internal of a spinlock, but we do not have any loops.

If it cannot find any inactive slots, it will insert a new node at the head. Still, it uses compare\_exchange. Since our linked-list is insert-only, it is ABA-proof.

## Locally retired blocks

Every thread has its own local structure (linked-list or array) to store pointers of retired blocks, which does not sharing with other threads.

Then, when a thread tries to retire a block, it will insert that block into the container, and then mark the slot as **inactive.**

## Garbage collection

When a thread terminates, or there are too many retired pointers that the amount of them reached a certain threshold, the thread will loop through all retired blocks, and see if there exists a hazard pointer that is still in the global hazard list.

If not, it means there is no other threads are currently using them, so it can be safely freed.

## Code

```rust
// Shared
fn acquire_slot(&self) -> &HazardSlot {
    if let Some(slot) = self.try_acquire_inactive() {
        return slot;
    }

    unsafe {
        let new_slot = Box::into_raw(Box::new(HazardSlot::new()));
        let new_ref = new_slot.as_mut().unwrap();
        new_ref.next = self.head.load(Ordering::Acquire);
        new_ref.active.store(true, Ordering::Release);

        loop {
            let result = self.head.compare_exchange(
                new_ref.next as *mut _,
                new_ref,
                Ordering::AcqRel,
                Ordering::Relaxed,
            );
            if let Err(e) = result {
                new_ref.next = e;
                fence(Ordering::Release);
                continue;
            }
            return new_ref;
        }
    }
}

fn try_acquire_inactive(&self) -> Option<&HazardSlot> {
    let mut slot: *const HazardSlot = self.head.load(Ordering::Acquire);
    unsafe {
        while !slot.is_null() {
            let r = slot.as_ref().unwrap();

            if r.active
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
                .is_ok()
            {
                return Some(r);
            }

            slot = r.next;
        }

        None
    }
}

pub fn all_hazards(&self) -> HashSet<*mut ()> {
    let mut set = HashSet::<*mut ()>::new();

    let mut slot: *const _ = self.head.load(Ordering::Acquire);
    unsafe {
        while !slot.is_null() {
            let r = slot.as_ref().unwrap();

            if r.active.load(Ordering::Acquire) {
                set.insert(r.hazard.load(Ordering::Relaxed));
            }

            slot = r.next;
        }
    }

    set
}

// Local
pub unsafe fn retire<T>(&mut self, pointer: *mut T) {
    self.inner.push((pointer as *mut (), free::<T>));
    if self.inner.len() >= Self::THRESHOLD {
        // Free
        println!("Retiring: {}", self.inner.len());
        self.collect();
    }
}

pub fn collect(&mut self) {
    let mut hazards = Vec::<(*mut (), unsafe fn(*mut ()))>::with_capacity(Self::THRESHOLD);
    let protected = self.hazards.all_hazards();

    for (ptr, free) in &self.inner {
        if protected.contains(ptr) {
            hazards.push((*ptr, *free));
            continue;
        }
        // println!("Free?");
        unsafe { free(*ptr) };
    }

    self.inner = hazards;
}


```

## References

* Hazard pointers: safe memory reclamation for lock-free objects [https://ieeexplore.ieee.org/document/1291819](https://ieeexplore.ieee.org/document/1291819)

