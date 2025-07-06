---
title: Getting started with lock-free concurrent data structure I - Stack
pubDate: 2025-02-08
---

## Abstract

When it comes to concurrent programming, a programmer's first thought would be locks, condition variables, semaphores, barriers, etc. Yet these structures are mostly provided by Operating systems, which made their cost expensive in aspect of performance (Frequent system calls are very inefficient).

Linux came up with a solution called **futex**, a mutex structure associated with an **atomic** value in user-space, to reduce the amount of system calls. But for programmers with a solid backgrounds, they tend to completely eliminate system calls by integrating atomic operations inside their data structures.

In this post, we will introduce a classic lock-free data structure - Treiber stack, and a more efficient structure based on it, by implementing them from the basic, and optimize it step-by-step.

Assumed knowledge: Basic usage of locks.

## A linked list protected by locks

A linked list is a basic structure for data managing. But when it comes to concurrency, the **next** pointer of the linked list is vulnerable to race condition. So the first idea will be - protect the linked list by introducing a mutex to ensure exclusive access for a thread, which means no other threads can operate the list while a thread is accessing it.

Then, a performance issue would arise — when multiple threads trying to access the list, they are competing against one single lock, which makes the process very inefficient and in extreme scenario may lead to starvation.

## What about Fine-grained lock

However, for a linked list, we do not need to protect the entire list by only one lock. As the post mentioned earlier, we only need to protect **next** pointer on each node. Hence, we can add mutexes to each node of the list, to protect the next pointer of it.

### Traversal

When we need to iterate the linked list, we need to get multiple locks for each node. We will try to acquire and release each node's lock in an elegant order. So for each node we are trying to access, we will perform these operations:

1. Get the node's lock
2. Access and output the node's data.
3. Get next node's lock (To ensure that the next node would not be freed when accessing)
4. Release this node's lock.
5. Repeat these steps for the next node.

### Inserting

When we want to insert a node after another node, we will follow these steps:

1. Assuming the thread have exclusive access to the node we are inserting.
2. Acquire previous node's lock. (If finding the intended position by iterating, then the lock should already been acquired)
3. the **next** pointer is protected, we can write it to the new node's **next** field.&#x20;
4. Write the new node's address to the **next** pointer of the previous node.
5. Continue iterating and repeat if we want to insert more values

### Removing

Let A be the node immediately before the node we are removing (B), and C be the node after B.

1. Acquire A's lock
2. Acquire B's lock
3. Write the next pointer of A to C
4. Now B is not in the list, we can release its lock and free it.

### Double-linked list

For double linked list, the idea is basically the same. But we need to acquire three lock at a time to protect data integrity, because we need to protect the **prev** pointer for the next node of the node we are operating.

```rust
fn insert(&self, key: T) -> bool {
    let cursor = self.find(&key);
    if cursor.0 {
        return false;
    }

    let mut prev = cursor.1.0;
    *prev = Node::new(key, *prev);
    true
}

fn remove(&self, key: &T) -> bool {
    let cursor = self.find(key);
    if !cursor.0 {
        return false;
    }

    let mut prev = cursor.1.0;
    let mut node = unsafe { Box::from_raw(*prev) };
    *prev = *node.next.lock().unwrap();
    drop(node);
    true
}
    
impl<'a, T> Iterator for Iter<'a, T> {
    type Item = &'a T;

    fn next(&mut self) -> Option<Self::Item> {
        let guard = &mut self.cursor;

        if guard.is_null() {
            None
        } else {
            unsafe {
                let node = guard.as_ref().unwrap();
                let next = node.next.lock().unwrap();

                *guard = next;

                Some(&node.data)
            }
        }
    }
}

impl<T> Drop for FineGrainedLinkedList<T> {
    fn drop(&mut self) {
        let mut this = self.head.lock().unwrap();
        let mut next: MutexGuard<'_, *mut Node<T>>;

        while !this.is_null() {
            unsafe {
                let node = this.as_ref().unwrap();
                *this.deref_mut() = *node.next.lock().unwrap();
                drop(Box::from_raw(node as *const _ as *mut Node<T>));
            }
        }
    }
}



```

## Back to the start - Stack

A stack can be implemented by a singly linked list. Inserting a node to the front of linked list is considered as **pushing** to the stack, while removing a node is **popping** from it. Though a stack does not need to do insertion and removal in the middle, we still need a lock to protect it from data racing. However, we cannot fine-grain the lock again because we are only accessing one node of the linked list at a time.

Likewise, as we discussed earlier, we can optimize the lock by reducing system calls, and in this case, we can completely eliminate system calls by using atomic operations, meaning that we are implementing a protection mechanism similar to a lock but completely in user space.

## What is a lock anyway?

An atomic operation is provided by hardware, which means, for a memory address that is marked as atomic, only one core of the CPU can have access to it. (This can be done by adding _lock_ prefix before instruction in x86, like "_lock cmpxchg"_)

The most simple lock (spin lock) utilizes this by having a bit flag marked as 0 or 1. 0 means no thread are currently using it, and 1 means there exist a thread using it. By using atomic operation **compare exchange**, CPU would compare 0 against the flag, and if the flag is 0, it would be rewritten as a 1.  All of these operations would been done atomically.&#x20;

If the operation failed, meaning that the flag is 1, the thread would try to acquire the lock again until it succeed. This is way it called spin lock. Consequently, when a thread releasing the lock, it will write 0 to the flag.&#x20;

## Can we push/pop atomically on a stack?

The **Treiber stack** is utilizing the idea of trying to operate on a stack atomically. Yet it does not implement a spin lock, it tries to atomically write onto the stack by swapping pointers.

We already have a singly linked list as a stack, so it is time to protect it.

### Pushing

When a thread trying to push onto the stack, it will first read the address on top of the stack, and write it to the new node's next pointer. Then, it will perform **compare exchange** on the top address against the address we read earlier, if they are the same, meaning that the operation succeed, the stack's top would already been atomically swapped to the new node's address.

When the operation failed, meaning that the top address of the stack changed by another thread, we cannot guarantee the operation is safe. In this case, we would try again until we successfully inserted it to the stack. (Same as a spin lock)

1. Read the current top address to pointer A
2. Make a new node with the **next** pointer copied from A
3. Compare-Exchange top address against A
   1. Succeed -> top address swapped to the new node, return
   2. Failed -> Retry

### Popping

For the pop operation, we will first read the top address of the stack, and then read the **next** node of the top node we obtained earlier.

Likewise, we perform **compare exchange** on the stack's top against the top address we obtained earlier. If it succeed, the **next** node we previously read will be the new top node of the stack. When it failed, we would try again.

1. Read the current top address to pointer A
2. Read the next address of A to pointer B
3. Compare-Exchange top address against A
   1. Succeed -> top address swapped to B
   2. Failed -> Retry

```rust
fn try_push(
    &self,
    req: Owned<Self::OpRequest>,
    guard: &Guard,
) -> Result<(), Owned<Self::OpRequest>> {
    let mut req = req;
    let head = self.head.load(Ordering::Relaxed, guard);
    req.next = head.as_raw();

    match self
        .head
        .compare_exchange(head, req, Ordering::Release, Ordering::Relaxed, guard)
    {
        Ok(_) => Ok(()),
        Err(e) => Err(e.new),
    }
}

fn try_pop(&self, guard: &Guard) -> Result<Option<T>, ()> {
    let head = self.head.load(Ordering::Acquire, guard);
    let Some(head_ref) = (unsafe { head.as_ref() }) else {
        return Ok(None);
    };
    let next = Shared::from(head_ref.next);

    let _ = self
        .head
        .compare_exchange(head, next, Ordering::Relaxed, Ordering::Relaxed, guard)
        .map_err(|_| ())?;

    let data = ManuallyDrop::into_inner(unsafe { ptr::read(&head_ref.data) });
    unsafe { guard.defer_destroy(head) };
    Ok(Some(data))
}

```

## Exchange between colliding push and pop operations

In Treiber stack, we are still _spinning_ the operation, making all threads competing with each other. Yet elimination backoff stack, based on Treiber stack, would mitigate this issue.

The idea behind elimination backoff stack is that, when a push operation failed while a pop operation pending, the pop operation will take the value of push operation and return it directly, making these two colliding operations resolve with each other without interfering with the stack itself.

For this structure, we will have an array of slots. When a push operation fails, the operation will select a random slot to **park** the operation. If the slot is already occupied, then we will retry the push.

After some time, if there is a pop operation take the parked value, the slot will be empty, thus we can derive that the collision has been resolved. But if not, we will retry the push.

### Pushing

1. Try to push value to the stack
   1. Succeed ⇒ Return
2. Pick a slot and park the value
3. Wait for some time
4. Check if still parked
   1. Slot empty ⇒ Return
5. Compare exchange with the slot against the value, swapping with null pointer
   1. Succeed ⇒ Goto Step 1
   2. Return

### Popping

The resolving logic is located in pop operation. When a pop operation fails, it will also select a random slot, and if that slot is occupied, the pop operation will take the value of that slot. If not, the operation will wait for some time and check if the slot is still empty. If not we can take that value directly. Otherwise, we would retry popping from the stack.

1. Try to pop value from the stack
   1. Succeed ⇒ Return
2. Pick a slot and check its value
   1. Slot occupied ⇒ compare exchange it against the value we previously read
      1. Succeed ⇒ Null pointer written to the slot, return the value.
      2. Failed ⇒ Goto Step 1
   2. Slot empty ⇒ Wait for some time and check again
      1. Slot occupied ⇒ Goto 2.a
      2. Slot still empty ⇒ Goto Step 1

```rust
fn try_push(
    &self,
    req: Owned<Self::OpRequest>,
    guard: &Guard,
) -> Result<(), Owned<Self::OpRequest>> {
    let Err(req) = self.inner.try_push(req, guard) else {
        return Ok(());
    };

    let index = get_random_elim_index();
    let slot_ref = unsafe { self.slots.get_unchecked(index) };
    let req = req.into_shared(guard);

    let Ok(req) = slot_ref.compare_exchange(Shared::null(), req, Ordering::Relaxed, Ordering::Relaxed, guard) else {
        // Current slot occupied, Retry and return.
        let Err(req) = self.inner.try_push( unsafe { req.try_into_owned().unwrap() } , guard) else {
            return Ok(());
        };
        return Err(req);
    };

    thread::sleep(ELIM_DELAY);

    // Check Collision
    if slot_ref.compare_exchange(req, Shared::null(), Ordering::Relaxed, Ordering::Relaxed, guard).is_err() {
        // Collision
        return Ok(());
    };

    // Retry
    let Err(req) = self.inner.try_push( unsafe{ req.try_into_owned().unwrap() }, guard) else {
        return Ok(());
    };

    return Err(req);
}

fn try_pop(&self, guard: &Guard) -> Result<Option<T>, ()> {
    if let Ok(result) = self.inner.try_pop(guard) {
        return Ok(result);
    }

    let index = get_random_elim_index();
    let slot_ref = unsafe { self.slots.get_unchecked(index) };
    let mut slot = slot_ref.load(Ordering::Relaxed, guard);

    if slot.is_null() {
        thread::sleep(ELIM_DELAY);

        // Try again
        slot = slot_ref.load(Ordering::Relaxed, guard);

        if slot.is_null() {
            // Still idle.
            if let Ok(result) = self.inner.try_pop(guard) {
                return Ok(result);
            }
            return Err(());
        }
    }

    if slot_ref.compare_exchange(slot, Shared::null(), Ordering::Relaxed, Ordering::Relaxed, guard).is_ok() {
        // Exchanged.
        let data: T = unsafe { ManuallyDrop::into_inner(ptr::read(slot.deref().deref())) };
        return Ok(Some(data));
    }

    // Retry
    if let Ok(result) = self.inner.try_pop(guard) {
        return Ok(result);
    }
    return Err(())
}

```

## References

* KAIST-CS431 - Treiber Stack Source Code [https://github.com/kaist-cp/cs431/](https://github.com/kaist-cp/cs431/)
