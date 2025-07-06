---
title: Getting started with lock-free concurrent data structure II - Memory ordering and fences
pubDate: "2025-02-11"
---

## Abstract

In the last post, we introduced two Stack data structures. To implement them, we need to further dig into modern atomic operations, in which memory ordering played an important role.

Different memory ordering will have different effects on memories. In this post we will revisit atomic operations, and introduce the basic of memory ordering.

## Atomic instructions

An atomic instruction has no difference between a normal instruction, except it can be executed exclusively in one core. For example, an **compare\_exchange** operation will let only one core access, compare and write to an address that is marked as atomic. If there exist another core reached such an operation, it must not be executed in software's perspective.&#x20;

The **compare\_exchange** operation looks like this when it is not atomic:

```wasm
load A
cmp A, <value>
load B
compare A, B
if not equal, return false
else swap B, A
```

When it becomes an atomic operation, it must be happen in only one instruction, and no other cores can operate on the memory addresses related. An atomic operation can be **occurred**, or it does not happen at all.

## Out-of-order execution

Modern CPUs would use out-of-order execution to optimize the performance. I once wrote a blog post about a time-based side channel attack utilized the security flaw of this technique. Moreover, compiler would also reorder instructions for optimization. When instructions are re-ordered, it may break programmer's assumptions.

For example:

```c
// Thread 1
a = 100;
store(b, 1);

// Thread 2
while (!load(b)) continue;
assert(a == 100); // &#x3C;-- This may fail!
```

Our assumption is that all programs are performed in source code order, in which the above assertions would always be successful. But, CPU/Compiler does not know the existence of another thread. So they cannot ensure correctness in thread synchronization when optimizing. The above code may be reordered to

```c
// Thread 1

// a = 100 <-- a is not available in CPU's perspective.
//            (maybe another core is reading/writing to it)
store(b, 1);
// Other operations that does not involve a
a = 100; // a becomes availale

// Thread 2
while (!load(b)) continue;
assert(a == 100); // <-- a is not 100!!!
```

## Fences

### Sequentially Consistent fence

To prevent CPU from reordering critical instructions. We need to **order** these instructions. In previous example, to make the assertion be passed in every run, we need to make `a = 100` executed **before** `store(b, 1)` . So between these two instructions, we can insert a fence between these two instructions, preventing instruction **after** the fence to be executed **before** the fence, and vice versa for the instructions **before** the fence.

```c
a = 100; // <-- This instruction cannot be reordered to execute after the fence
_mm_mfence(); // x86 use mfence instruction to create a memory fence
store(b, 1); // <-- This instruction cannot be reordered to execute before the fence.
```

Such a mechanism is default in most x86 compilers when programmers does not specify memory orders. It makes sense because it is the only way to ensure correctness **without knowing the complete program**.&#x20;

However, it is not efficient. Out-of-order execution is designed to optimize the performance. Yet a memory fence disables such a mechanism, stalling the CPU pipeline until all instructions before the fence executed. This is called **Sequentially Consistent** order, meaning that instructions must be executed in a **single total order** (all threads will follow the source-code order of instructions).

### One-way fence

Consider the previous example again, we only need these instructions with **a** and **b** to be in an order. What if there is other instructions which reordering does not affect the correctness?

```c
// The instruction pointer starts here
// |
// |
// V
mov(c, d); // <-- Not available at the moment
xor(a1, b1); // <-- Not available at the moment
a = 100; // <-- Not available at the moment

// A fence needed for correctness

store(b, 1);
mov(e, f); // Available, can be executed 
xor(c1, d1); // Available
```

If we insert a sequentially consistent fence, we need to wait for all of **a, a1, b1, c, d** to be available (memory is very slow compared to CPU cycle!). But **e, f, c1, d1** are available in cache, and does not affect the correctness of program.&#x20;

Is there a **one-way** fence that allows reordering instructions after the fence to be executed before the fence while still maintaining the correctness? If so, we can put these instructions into the pipeline instead of stalling.&#x20;

_Note that when doing out-of-order execution, a change of value may not be **globally-visible**, meaning that if this thread executed `mov(e, f)` , other threads may still see **e** and **f** as their original value._

```c
a = 100;
fence(Release); // <-- Insert the fence before stores.
store(b, 1);
store(another_b, 1);
```

### Release/Acquire Fence

In the above example, what we need is a **release** fence, which, if completely executed, all variables before the fences are globally-visible (instructions executed), and instructions after the fence **may be executed** (and if executed, it **may not be globally-visible**). In one word, after the fence, every instructions before the fence are completed, and all variables before the fence can be used safely.

In opposite direction, we call it **acquire** fence. Meaning that all variables **after** the fence cannot be reordered to be **before** the fence. Consider the example of Thread B.

```c
while (!load(b)) continue; // <-- Wait for a flag
assert(a, 100);
```

Without the fence, **a**'s value may be obtained before **b** becomes **1**. So we need an **acquire** fence to ensure that every instruction **after** the fence cannot be reordered to execute before it. But it allows reordering for instructions before the fence.

```c
load(another_b);
while (!load(b)) continue;
fence(Acquire); // <-- Insert the fence after loads.
assert(a, 100);
```

## Memory Orders

### Release/Acquire

A release store operation is equivalent to the following code. So all variables before this store are available when using Acquire load.

```c
store(b, 1, Release);
// |
// |
// V
fence(Release);
store(b, 1);
```

An acquire load operation is equivalent to the following code. So all operations after the load can be executed safely.

```c
load(b, 1, Acquire);
// |
// |
// V
load(b);
fence(Acquire);
```

### Release/Consume

A consume load operation is a weaker memory order compared to Release/Acquire. When Release/Consume is used, variables before the release store **may not be available**. Instead, it restrict all operations that **depends on the loaded variable**, after the consume load. This is useful and efficient when passing pointers between threads.

```c
// Thread 1
b = 100;
store(a, ptr, Release);

// Thread 2
ptr = load(a, Consume);
load(ptr->field1) // <-- safe
assert(b == 100); // NOT SAFE
```

### AcqRel

This memory order is used for an atomic operation that consists of both **load and store** (such as compare exchange). It ensures Acquire order on load, and Release order on store.

### SeqCst

This order insert a sequentially consistent fence between operations, to ensure a single total order. But it is inefficient and should be replaced by weak memory order like Release/Acquire in most cases. However, it is useful for some cases where the operations need to read and write variables in a specific order. Here is an example from [cppreference](https://en.cppreference.com/w/cpp/atomic/memory_order).

```cpp
#include <atomic>
#include <cassert>
#include <thread>
 
std::atomic<bool> x = {false};
std::atomic<bool> y = {false};
std::atomic<int> z = {0};
 
void write_x()
{
    x.store(true, std::memory_order_seq_cst);
}
 
void write_y()
{
    y.store(true, std::memory_order_seq_cst);
}
 
void read_x_then_y()
{
    while (!x.load(std::memory_order_seq_cst))
        ;
    if (y.load(std::memory_order_seq_cst))
        ++z;
}
 
void read_y_then_x()
{
    while (!y.load(std::memory_order_seq_cst))
        ;
    if (x.load(std::memory_order_seq_cst))
        ++z;
}
 
int main()
{
    std::thread a(write_x);
    std::thread b(write_y);
    std::thread c(read_x_then_y);
    std::thread d(read_y_then_x);
    a.join(); b.join(); c.join(); d.join();
    assert(z.load() != 0); // will never happen
}
```

If there is no reordering, in both read-then threads, when the while spin breaks, there must be at least one of x and y be true, otherwise both threads would keep spinning. Hence, z must not be 0.

But if we consider out-of-order execution, this is not possible without a sequentially consistent ordering. So we must insert a fence between while spin and if statement. Such a scenario is very rare.

## References

* Rust atomics and locks - Chapter 3 [https://marabos.nl/atomics/memory-ordering.html](https://marabos.nl/atomics/memory-ordering.html)
* std::memory\_order CppReference [https://en.cppreference.com/w/cpp/atomic/memory\_order](https://en.cppreference.com/w/cpp/atomic/memory_order)
