---
title: Getting started with lock-free concurrent data structure III - Behaviour oriented concurrency
pubDate: 2025-02-15
---

## Abstract

The purpose of behaviour oriented concurrency (boc) is to eliminate deadlock completely. It enforces a global total order for every shared variable. Moreover, it tries to prevent blocking when trying to gain access to a shared variable, achieving more efficient scheduling.&#x20;

To implement this, BOC used asynchronous scheduling of threads, and using **Cown**s as a lock to protect the inner value.

## Preventing deadlock

A deadlock may happen when these conditions met:

* **Mutual exclusion**: Multiple threads cannot share a resource at the same time.
* **No preemption**: A thread cannot take resources which other thread is using.
* **Hold and wait**_:_ There may be a thread holding at least one resource and requesting resources which are being used by other threads.
* **Circular wait**: There is a set of threads in which every thread owns a resource, and requesting resources held by other threads in the same set, forming a loop of acquisition.

BOC breaks the **Circular wait** condition by enforcing an order of acquiring and releasing locks. According to[ the original article of BOC](https://dl.acm.org/doi/10.1145/3622852):

_The dependency graph is at the heart of the BoC runtime. It is an directed acyclic graph (DAG) of behaviours, whose edges express the holding of a cown needed by a successor._

(A directed acyclic graph does not have a loop)

## Cowns and Behaviours

BOC introduces a protected structure - **Cown** (Concurrent Owner). A cown wraps the protected resource and acts as a lock. A behaviour consist of — Resources (Cowns) needed and the clause body (code).

A Behaviour is defined by **when** clause.&#x20;

```cs
when(a, b) {
    operate(a);
    operate(b);
}
```

Both a and b are cowns. When the program reaches the **when** clause, it will try to **asynchronously** acquire locks of a and b in a specific order, meaning that it will summon a new thread every time when the locks are acquired. (Note that acquiring locks are not blocked)

## Example - Fibonacci

```rust
fn fibonacci(n: usize, signal: Option<Arc<Condvar>>) -> Cown<usize> {
    if n == 0 {
        Cown::new(0)
    } else if n == 1 {
        Cown::new(1)
    } else {
        let a = fibonacci(n - 1, None);
        let b = fibonacci(n - 2, None);
        when!(a, b) { // <-- It will spawn a thread of the following
            *a += *b;
            if Some(sig) = &signal {
                sig.send(); // Complete
            }
        });
        a
    }
}
```

## Implementation based on the article

### Cown

A cown wraps the protected object and a pointer of the latest _Request_ to maintain a list structure.

```cs
class CownBase : StableOrder {
    ----------------------------
    ---- Protected objects -----
    ----------------------------
    volatile Request? last = null;
}
```

### Behaviour

A behaviour consist of _thunk_ (function body or clause), requests, and an atomic counter to count how many cowns that are currently holding by another thread. When the counter reaches 0, the thunk will be executed.

### Request

A request maintained a list structure of _Behaviou&#x72;_&#x73;. So that when the request finishes, it can release the lock by decrementing the reference counter of the next behaviour.

### Queueing for acquiring a lock

To ensure an order of execution of threads and prevent starvation, the implementation used a queue structure like a linked list, but instead of maintaining a list, it uses **swap** operation (atomic) to insert to the list, and get the address of previous node **on stack**.

```csharp
void StartAppendReq(Behaviour behaviour) {
    var prev = Swap(ref target.last, this);
    // Now prev is the last request of the cown
    // And the latest request has been written to this
    if (prev == null) {
        // This is the first request of the cown.
        // Resolve (Release) it immediately
        // to make the current behaviour acquire the cown.
        // Resolve means give another thread exclusive access to a cown
        behaviour.ResolveOne();
        return;
    }
    
    // The previous request has been scheduled,
    // Meaning that the previous behaviour has been written
    // into the queue of behaviours
    
    // This way, Request queue and Behaviour queue are all synchronized
    // Suppose Behavior 1 has Request 1, and Behaviour 2 has Request 2
    // This will be the final memory layout.
    // Req1 -> Req2
    // Beh1 -> Beh2
    while (!prev.scheduled) { /∗spin∗/ }
    prev.next = behaviour; // Now we can safely insert our behaviour into the queue
}

// Called when all requests of the current behaviour has been Scheduled successfully
void FinishAppendReq() { scheduled = true; }
```

### Releasing the lock

When releasing the lock, we will consider three scenarios.

* This is the last Request of the cown
  * In this situation, next should always be null, and the cown (target)'s last Request must always be this.
  * So we can easily return and end the Request.
* This is not the last Request of the cown and next is not null
  * There exist a next behaviour of this Request.
  * So we Resolve the next behaviour (Releasing the cown) and give it to the next.
* This is not the last Request of the cown but next is null
  * This situation occurs when the request list has not been completely scheduled.
  * We will wait for scheduling, and then resolve it.

```cs
// Class Request
void Release() {
    if (next == null) {
        if (CompareExchange(ref target.last, 
                null, this) == this)
            return;  
        while (next == null) { /∗spin∗/ }
    }
    next.ResolveOne();
}

// Class Behaviour
void ResolveOne() {
    if (Decrement(ref count) != 0)
        // When count is 0, meaning that
        // all cowns has been allocated to
        // this behaviour
        return;
        
    // Run the task
    Task.Run(() => {
        thunk();
        
        // After that, we release all requests
        // of this behaviour
        foreach (var r in requests)
            r.Release();
    });
}
```

### Start a behaviour

We need to sort the cowns so that **the order of acquiring/releasing cowns are always the same in every thread.** (This can be done by sorting by pointer value, assuming all cowns' address would not change)

Then we will append the request (schedule request) to the cowns. After that, we will notify all requests that request appending is completed.

To kickstart the routine, we will fire ResolveOne() on this behaviour, but this will make the counter being subtracted once more. So we will have the counter be the `count of cowns + 1`.

```cs
static void Schedule(Action t, params CownBase[] cowns) {
    Array.Sort(cowns);
    var behaviour = new Behaviour(t, cowns);
    behaviour.count = cowns.Length + 1;
    foreach (var r in behaviour.requests)
        r.StartAppendReq(behaviour);
    foreach (var r in behaviour.requests)
        r.FinishAppendReq();
    behaviour.ResolveOne();
}
```

## Rust implementation

```rust
// Request
unsafe fn start_enqueue(&self, behavior: *const Behavior) {
    let self_ptr: *mut Request = self as *const _ as *mut Request;
    let prev_req = self.target.last().swap(self_ptr, Ordering::Relaxed);

    if prev_req.is_null() {
        unsafe { Behavior::resolve_one(behavior) };
        return;
    }

    let prev_req = unsafe { prev_req.as_mut().unwrap() };

    while !prev_req.scheduled.load(Ordering::Acquire) {} // Spin until previous scheduled
    prev_req.next.store(behavior as *mut _, Ordering::Release); // So that we can insert this behavior to the request list
}

unsafe fn finish_enqueue(&self) {
    self.scheduled.store(true, Ordering::Release);
}

unsafe fn release(&self) {
    let mut next = self.next.load(Ordering::Acquire);
    if next.is_null() {
        if self.target.last().compare_exchange(self as *const _ as *mut Request, ptr::null_mut(), Ordering::AcqRel, Ordering::Acquire).is_ok() {
            return;
        }

        loop {
            next = self.next.load(Ordering::Acquire);
            if !next.is_null() {
                break;
            }
        }
    }
    unsafe { Behavior::resolve_one(next) };
}

// Behaviour
fn new<C, F>(cowns: C, f: F) -> Behavior
where
    C: CownTuple + Send + 'static,
    F: for<'l> Fn(C::CownRefs<'l>) + Send + 'static,
{
    let mut v = cowns.requests();
    let len = v.len() + 1;
    v.sort();

    Behavior {
        requests: v,
        count: AtomicUsize::new(len),
        thunk: Box::new(move || unsafe { f(cowns.get_mut()) })
    }
}

fn schedule(self) {
    let ptr = Box::into_raw(Box::new(self));

    unsafe {
        for req in &(*ptr).requests {
            req.start_enqueue(ptr);
        }

        for req in &(*ptr).requests {
            req.finish_enqueue();
        }

        Behavior::resolve_one(ptr);
    }
}

unsafe fn resolve_one(this: *const Self) {
    let self_ref = unsafe { this.as_ref().unwrap() };
    if self_ref.count.fetch_sub(1, Ordering::AcqRel) != 1 {
        return;
    }

    let self_owned: Box<Self> = unsafe { Box::from_raw(this as *mut Self) };

    ThreadPool::execute(move || {
        (self_owned.thunk)();
        for req in &self_owned.requests {
            unsafe { req.release() };
        }
    });
}    

```

## Reference

* When Concurrency Matters: Behaviour-Oriented Concurrency: [https://dl.acm.org/doi/10.1145/3622852](https://dl.acm.org/doi/10.1145/3622852)
