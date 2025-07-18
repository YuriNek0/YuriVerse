---
title: "Rust: The Greatest Innovation in Modern Programming"
pubDate: "2025-01-31"
---

## Abstract

Among the history of programming languages, there always be some point where a revolutionary idea came up and then became a standard. Back in 1945, when the ENIAC coding system being finished, programmers used hard wires to represent the logic (or _code_ in modern days) of the program, which was very complex and time-consuming. Then the assembly language came up in 1947. After that, BASIC emerged as _high-level programming language_.&#x20;

These are all revolutionary changes to the computing industry. Though they may hard to understand compared to modern programming languages, they inspired people to create new languages, which have new and useful features compares to their predecessors. For example, C is more human-readable and can control the memory layout for low-level programmers. Then Objective-C and C++ extended C to have object-oriented features.&#x20;

After a decade, programmers tend to write codes in more high level, such as HTTP servers and GUIs. They found out handling memory operations manually can make things harder than they supposed to, and it can be easily gone wrong. So interpreter-based languages like Java and Python came up, without any manual memory management, they could be used easily. Soon after there's JIT compilers to increase performance for these languages.

Now, programmers are trying hard to improve different aspect in concurrent programming. So languages like Go, Rust and Swift came up. Go focus on the simplicity of the code, and introduced lots of features like goroutine and channel to make concurrent programming easier. Rust and Swift are mainly focused on Safety.

In this post, I will introduce the ideas behind Rust programming language, with a detailed example found in [The Rust Programming Language Book](https://doc.rust-lang.org/book/ch20-00-final-project-a-web-server.html).

## Ownership

When we are coding in C, we would always use pointers. But most of the security risks are related to pointers (Buffer overflow, Use-After-Free, etc). Rust tried to eliminate the pointers from its design. Instead, it introduced concept of **ownership**.

Take an example of the C code below, when we are trying to free the ptr1, both ptr1 and ptr2 are not being set to NULL (invalidated), which means, if we are trying to access the data on the heap again by ptr1/ptr2, an Use-After-Free issue will emerge.

```c
void example() {
    uint32_t* ptr1 = (uint32_t*)malloc(sizeof(uint32_t));
    uint32_t* ptr2 = ptr1;
    free(ptr1);
    
    // Disasterous
    *ptr1 = 100;
    *ptr2 = 200;
}
```

Rust tend to solve this problem by ensuring exclusive access for the same resources. In another word, rust will use borrow checker to let only one variable **owning** a resource. This is called ownership. Now we will try to rewrite the C code into rust.

```rust
fn example() {
    let mut resource: SomeResource = SomeResource::new(); // resource now owned SomeResource
    let mut resource_ptr2: SomeResource = resource; // Now resource_ptr2 owned SomeResource
    
    resource.modify(100); // Not allowed!
    resource_ptr2.modify(200);
}

fn example2() {
    let mut resource: SomeResource = SomeResource::new();
    call(resource); // The function *call* now owned the resource
    
    resource.modify(100); // Not allowed!
}

fn give_back_ownership(resource: SomeResource) -> SomeResource {
    // ...Doing stuff....
    resource; // Return the ownership back as the return value.
}

fn maintain_ownership_in_call() {
    let mut resource: SomeResource = SomeResource::new();
    resource = give_back_ownership(resource); // The ownership is given to the function
    // Then the function give it back to the resource variable.
    
    resource.modify(100); // resource variable is still valid!
}
```

Rust compiler will complain about the `resource.modify` line. That is because the variable _resource_ now does not own a valid SomeResource in that line. This is called **ownership transfer**, and it is done implicitly. Most common scenarios of this happening are variable reassigning in example1, and function parameter in example 2.

## Borrowing

Yet in a lot of cases, we will need to _share_ access to other instances, and with ownership this will be pretty hard to implement. So the concept of borrowing came into place. Borrowing allows **temporary transfer of read/write access** to another variable, but only one variable can **write** to an instance. After a **write** to the resource, all read-only borrowings are invalidated.

```rust
fn example() {
    let mut resource: SomeResource = SomeResource::new();
    call(&mut resource); // The function temporarily get read&write access.
    // The function now returned the access to its owner.
    
    resource.modify(100); // Valid code!
}

fn example2() {
    let mut resource: SomeResource = SomeResource::new(123); // resource now owned SomeResource
    let mut write: SomeResource = &mut resource; // The owner gave its exclusive write access to *write*
    let read: SomeResource = &resource;
    let read2: SomeResource = &write; // Multiple read-only borrowing is allowed.
    
    assert_eq!(read, 123);
    assert_eq!(read2, 123);
    resource.modify(100); // Invalid, only *write* have write access to the resource.
    
    write.modify(100); // *write* have write access, allowed.
    assert_eq(read, 100); // Not allowed! After a write, all read-only borrowings are invalidated.
}
```

## Lifetime

Lifetime is a measure to a resource's valid time. It is a notation mostly in function declarations, which helps the compiler to determine the validity of a returned value of a function.

Take an example of the most simple case:

```rust
fn example_call(a: &SomeResource, b: &SomeResource) -> &AnotherResource {
    // return a or b
}
```

The compiler will complain about the lifetime notation, because it cannot determine whether a result referencing a or one that referencing b is returned. So a lifetime notation is required.

```rust
fn example_call<'a>(a: &'a SomeResource, b: &'a SomeResource) -> &'a AnotherResource {
    // return a or b
}
```

The **'a** here is just another name with a single-quote as a mark. We can change the **a** to whatever we like (except **'static**).

Then, when we call the function, the compiler could now determine which references are linked to the return value.

```rust
fn example() -> () {
    let a = SomeResource::new();
    let b = SomeResource::new();

    let c = example_call(&a, &b);
    drop(b); // Since b and return value c have the same lifetime, c is now invalid.
    
    println!("{}", c);
}
```

However, if we are certain that the function would only reference a set of variables in the parameter, we can make them appears as the same lifetime.

```rust
fn example_call<'a>(a: &'a SomeResource, b: &'b SomeResource) -> &'a AnotherResource {
    return AnotherResource(a);
}

fn example() -> () {
    let a = SomeResource::new();
    let b = SomeResource::new();

    let c = example_call(&a, &b);
    drop(b); // Since b's lifetime irrelavent to c, c remains valid.
    
    println!("{}", c); // Valid code.
}
```

Note that **'static** is a special lifetime keyword, meaning that the variable have only one instance, and it is always valid until the program terminates (The compiler would have mechanism to check on this). There is a special case in generic types, where the keyword means that the variable **could** live through **the current scope**.

```rust
fn print_static<T: AsRef<str> + 'static>(value: &T) {
    println!("{}", value.as_ref());
}

fn main() {
    let s: &'static str = "Hello, Rust!";
    print_static(&s); // Works because string literals have 'static lifetime

    let owned_string = String::from("Owned String");
    print_static(&owned_string); // Still works because owned_string can life throughout the print_static
}
```

## An easier way to understand

We can use the concept in concurrent programming to understand the concept above more easily. A resource could be seen as a **protected resource**. To prevent race-condition, only one thread (variable) can write to the resource. A read-write lock is a great solution for this scenario, which can allow multiple threads read for a single resource but only one thread is allowed to write it.

Then, the pattern becomes clear.&#x20;

* **Ownership**: When we acquire access in a variable, we get write-locked.&#x20;
* **Transfer**: We can transfer the lock to another thread and therefore lose access of the resource.
* **Read-only Borrowing**: A thread acquires read-lock to a resource.
* **Mutable Borrowing**: A thread acquires write-lock to a resource.
* **Lifetime**: A variable's lifetime is a critical section where the thread can access the variable safely.

## An example project

By referencing the book, we used a similar implementation of the thread pool. First, we need to define a **Job**. We used a Box containing a **dyn** function with **Send** ability (trait).

A **Box** wrapped the inside value to the **heap**. The reason behind using a box is that a Trait is not a type and must be **dynamically dispatched** (Otherwise we don't know what is the size of the type, making the compiler impossible to copy/move the memory). We can think of Trait as an interface in Java.

**dyn** means the value is dynamically dispatched (by an invincible pointer), and the **Send** trait allows the function type to be Send through multiple threads. Note that these are a declaration of a type, which acts as a **constraint** of what the **Job** should look like.

Then, for the multi-thread communication, we used a **channel**, which is similar to **channel** in Go. A channel is a smart-pipe that can easily transfer data between threads (or even processes), without ever think of serializing/deserializing as long as the type information is known. We can use **Sender** and **Receiver** traits to access the channel.

```rust
use std::thread::JoinHandle;
use std::collections::LinkedList;
use std::sync::{mpsc, Arc, Mutex};

type Job = Box<dyn FnOnce() -> () + Send>;

pub struct ThreadPool {
    threads: LinkedList<JoinHandle<()>>,
    sender: mpsc::Sender<Job>
}
```

Since the channel is not thread-safe and cannot be cloned (cannot use features like dup system call), we should protect it with a mutex, and use an **atomic reference counter (Arc)** to share the receiver between threads. Arc enables the possibility of using a traditional reference counter to manage the resource, which means even an Arc invalidated, the resource would still be in memory as long as another thread still have access to the resource (By clone).

To share the receiver, we need to first clone the Arc, and then **move** (transfer) it to the closure. In that closure, we will constantly read the **Jobs** it sent through, and dispatch it.

When the thread pool is shutting down, we need to wait until all threads finishes its work. **drop** is like a **destructor** in C++, which is called when the resource is no longer in use. Rust drops resources automatically when the resource is out of scope (lifetime). In this case, when we are dropping the thread pool, we **join** all threads to ensure that they exited.

```rust
impl ThreadPool {
    pub fn new(nums: u32) -> ThreadPool {
        let (sender, receiver) = mpsc::channel();
        let mut pool = ThreadPool {
            threads: LinkedList::new(),
            sender,
        };
        let receiver = Arc::new(Mutex::new(receiver));
        for _ in 0..nums {
            let cloned_receiver = Arc::clone(&receiver);
            pool.threads.push_back(
                std::thread::spawn(
                    move || {
                        loop {
                            let routine = cloned_receiver.lock().unwrap().recv();
                            if let Ok(routine) = routine {
                                routine(); // call the routine
                            }
                            else {
                                break; // Channel closed
                            }

                        }
                    }
               )
            );
        }
        pool
    }

    pub fn execute<F>(self: &Self, closure: F) ->() 
        where F: FnOnce() + Send + 'static
    {
        // Send the closure through the channel
        self.sender.send(Box::new(closure)).unwrap();
    }
}

impl Drop for ThreadPool {
    fn drop(self: &mut Self) {
        while !self.threads.is_empty() {
            self.threads.pop_front().unwrap().join().unwrap();
        }
    }
}
```

The remaining logic is simple, we could just implement a single-thread HTTP server, and then, for each incoming connection, we send a closure to handle the connection.

```rust
pub mod threadpool;

use std::net::{TcpListener, TcpStream};
use std::io::{Write, BufRead, BufReader};
use std::time::Duration;
use regex::Regex;
use std::thread::sleep;
use threadpool::ThreadPool;

fn invalid_request(stream: &mut TcpStream) {
    println!("Bad request.");
    stream.write_all(b"HTTP/1.1 400 Bad Request\r\n\
                    Content-Type: text/text\r\n\
                    Content-Length: 71\r\n\r\n\
                    Invalid request.").ok();
}

fn handle_connection(mut stream: TcpStream) {
    let mut reader = BufReader::new(&stream);

    // Parse header
    let mut buf = String::new();

    if reader.read_line(&mut buf).is_err() {
        invalid_request(&mut stream);
        return;
    }

    sleep(Duration::from_secs(1));

    println!("New connection! Starting to parse header.");

    let mut path: String = String::new();
    let mut content: String = String::new();
        
    if let Some(buf_s) = buf.strip_suffix("\r\n") {
        buf = String::from(buf_s);
    }

    if let Some(req_capture) = Regex::new(r"GET (?<path>[A-z0-9_\/]+)(?:\?(?:content=(?<content>.*))|.*)? HTTP\/(?<version>\d\.\d)").unwrap()
        .captures(buf.as_str())
    {
        req_capture["path"].clone_into(&mut path);
        req_capture.name("content").map_or("", |m| m.as_str()).clone_into(&mut content);
        println!("Path: {:?}", &path);
        println!("Version: {:?}", &req_capture["version"]);
        println!("Content: {:?}", &content)
    }
    else {
        invalid_request(&mut stream);
        return;
    }
    
    let mut failed = false;
    println!("------- HEADER -------");
    buf = String::new();
    while reader.read_line(&mut buf).is_ok() {
        if let Some(buf_s) = buf.strip_suffix("\r\n") {
            buf = String::from(buf_s);
        }
        else {
            invalid_request(&mut stream);
            failed = true;
            break;
        }

        if buf.is_empty() {
            break;
        }
        if let Some(header_capture) = Regex::new(r"([A-z\-]+):(.*)").unwrap()
            .captures(buf.as_str())
        {
            println!("Name: {:?}, Content: {:?}", &header_capture[1], &header_capture[2].strip_prefix(" ").unwrap_or(&header_capture[2]));
        }

        buf = String::new();
    }
    println!("----------------------");

    if failed {
        return;
    }

    // Receive content
    let retn_str = String::from("Halo! You are accessing ") + path.as_str()
                    + "!\r\nYour content:\r\n" + content.as_str();

    let retn_str = String::from("HTTP/1.1 200 OK\r\n\
                    Server: Awsl\r\n\
                    Cache-Control: no-store\r\n\
                    Content-Type: text/text\r\n\
                    Content-Length:") + retn_str.len().to_string().as_str() + "\r\n\r\n" + retn_str.as_str();

    println!("Request parsed.\r\nReturning: {:?}", retn_str);

    stream.write_all(retn_str.as_bytes()).ok();
}

fn main() {
    let listener: TcpListener = TcpListener::bind("127.0.0.1:8000").expect("Cannot bind to address.");
    let pool: ThreadPool = ThreadPool::new(8);
    println!("Bind address: http://127.0.0.1:8000");

    for stream in listener.incoming() {
        let stream = stream.expect("Failed to listen on stream.");
        pool.execute(move || handle_connection(stream));
    }
}
```

## \[Extension] Scope of if let and while let

During the first iteration of my multi-thread server, I noticed something odd. The server does not act as multi-thread at all! This is the original code.

```rust
std::thread::spawn(
    move || {
        loop {
            if let Ok(routine) = cloned_receiver.lock().unwrap().recv() {
                routine(); // call the routine
            }
            else {
                break; // Channel closed
            }

        }
    }
)
```

I figured out that after the if let expression, the mutex is still locked, causing other threads to wait when the current thread doing jobs. The fix is pretty simple — Make the `cloned_receiver.lock().unwrap().recv()`out of the if let expression.

Out of curiosity, I started to dig up on this matters. Then I found this post [https://stackoverflow.com/questions/58968488/why-is-this-mutexguard-not-dropped](https://stackoverflow.com/questions/58968488/why-is-this-mutexguard-not-dropped). The solution is pretty a straight-forward answer.&#x20;

In my understanding, both while-let and if-let are synthetic sugar of `match` expression. According to [the rust reference](https://doc.rust-lang.org/beta/reference/glossary.html#scrutinee), in `match x { A => 1, B => 2 }`, the expression `x` is the scrutinee.&#x20;

A scrutinee is considered a _place expression_, which represents a memory location. Thus it have the potential to live out the entire program, i.e. having **'static** lifetime. Hence, instead of consider the lock as a temporary value, the compiler preserves the lock reference in the whole block, until the routine is finished, causing the lock to be not released.

Therefore, the solution is to make the expression to be a _value expression_ instead of a _place expression_. So that the lock will then be considered as temporaty value and dropped immediately after the recv().
