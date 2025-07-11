---
title: Introduction to Asynchronous Programming
pubDate: "2025-02-03"
---

## Abstract

Asynchronous programming are often used in I/O bound operations, where a server performing a large amount of I/O tasks to the disk, or processing huge amount of network requests.

By the mean of asynchronous, the program _pauses_ the current operation and do other works while waiting for I/O operation to complete. As a reverse engineer, this scenario may resembles to task dispatching in operating system, and actually they all share with the same idea. The operating system pauses a thread and perform context switching to do other jobs while the thread waiting for a certain event.

However, context switching in operating system introduces great amount of overhead, and lots of unnecessary operations are performed in kernel (System calls are costly!). Hence asynchronous programming moves the idea of _threading_ into user-space, and manage them by themselves.

## Scenario

Imagine you are a heavy user to cloud drives, and you have 4TB of data on the cloud. One day, you discovered another cloud service offers more space with less cost. You decided to move your data from your current cloud provider to this one. Yet, moving such a large amount of data would still be costly. Luckily, you found a service that can help you moving these data, which cost $1 per GB. Using their service, you need $4096 to move your online drive.

However, buying a 4TB hard drive costs at most $300, and a Samsung 4TB SSD cost $500. So with that large amount of cash, you would better switch to offline storage. But your internet speed would make the process take months to complete. (Thanks for the poor infrastructure in Sydney. Most users can only afford _**up to**_ 20Mbps uplink traffic.)

Then you discovered online VPS provider, who provides up to 10Gbps network bandwidth, and offers storage for $0.08 GB-month, which costs $350 for storing the entire data for a month. Apparently you do not need to cost that much since you only needs few days or few hours to move your data. You thought this would be the better choice.

### Simulation code of your cloud providers

```python
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import sys
import random
import string

class SourceHandler(BaseHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        self.fd = open("/dev/urandom", 'rb')
        super().__init__(*args, **kwargs)

    def __del__(self):
        self.fd.close()

    def do_POST(self):
        self.send_response(403)
        self.end_headers()
        self.wfile.write(b"Unsupported.")

    def do_GET(self):
        size = random.randint(10 * 1024 * 1024, 2 * 1024 * 1024 * 1024) # 10M to 2G
        filename = "".join(random.choice(string.ascii_letters) for _ in range(10))
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Disposition", f"attachment; filename=\"{filename}\"")
        self.end_headers()

        print(f"Sending file {filename} - {size // 1024 // 1024} MB")
        while size - 1024 >= 0:
            self.wfile.write(self.fd.read(1024))
            size -= 1024

        self.wfile.write(self.fd.read(size))

class DestinationHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.fd = open("/dev/null", 'wb')
        super().__init__(*args, **kwargs)

    def __del__(self):
        self.fd.close()

    def do_GET(self):
        self.send_response(403)
        self.end_headers()
        self.wfile.write(b"Unsupported.")

    def do_POST(self):
        self.send_response(200)
        self.end_headers()

        size = int(self.headers.get("Content-Length"))
        filename = self.path[1:]
        print(f"Receiving file {filename} - {size // 1024 // 1024} MB")
        while size - 1024 >= 0:
            self.fd.write(self.rfile.read(1024))
            size -= 1024
        self.fd.write(self.rfile.read(size))

def run(port: int, handler_class):
    server_address = ("127.0.0.1", port)
    httpd = ThreadingHTTPServer(server_address, handler_class)
    httpd.serve_forever()

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f"{sys.argv[0]} <mode> <Port>")
        sys.exit(1)

    _, mode, port = sys.argv
    port = int(port)

    if mode == "src":
        run(port, SourceHandler)
        sys.exit(0)
    if mode == "dst":
        run(port, DestinationHandler)
        sys.exit(0)

    print("Mode must be src/dst.")
    sys.exit(1)
```

## Naive Approach - Download and then Upload

This solution is very simple. Download the entire cloud drive to the storage pool of VPS, and then upload them to your new provider. The process is more like copying files, and it can be done with only a browser.

<figure>

![](<./assets/image (44).png>)

<figcaption></figcaption></figure>

### Automated Approach - Download and Upload files using a script

We can use **requests** library in python to perform the downloading and uploading automatically.

```python
import requests
import re
import os

def fetch() -> str:
    with requests.get("http://127.0.0.1:8000") as resp:
        resp.raise_for_status()
        filename = re.findall("filename=(.+)", resp.headers['content-disposition'])[0]
        print(f"Fetching {filename}")

        with open(f"/tmp/{filename}", 'wb') as w:
            for chunk in resp.iter_content(1024):
                w.write(chunk)

        return filename

def upload(filename: str):
    with open(f"/tmp/{filename}", 'rb') as f:
        resp = requests.post(f"http://127.0.0.1:8001/{filename}", files={filename: f})
        if resp.status_code == requests.codes.ok:
            print(f'File {filename} uploaded')
        else:
            print(f'Error when uploading file {filename}')
    os.unlink(f"/tmp/{filename}")

if __name__ == "__main__":
    while True:
        upload(fetch())
```

<figure>

![](<./assets/image (45).png>)

<figcaption><p>Source Provider</p></figcaption></figure>

<figure>

![](<./assets/image (46).png>)

<figcaption><p>Destination Provider</p></figcaption></figure>

However, it takes lots of time to transfer a single file as the screenshots show. The script waits for a long time to download the file, and then waits for uploading. This approach only creates one connection for a single file, and it is very ineffective.

## Multi-threading approach

Using multiple thread can process multiple files at the once, this will create multiple connections to the remote, making the transfer process more efficient.

```python
import requests
import re
import os
import threading
import time

running = True

def fetch() -> str:
    with requests.get("http://127.0.0.1:8000") as resp:
        resp.raise_for_status()
        filename = re.findall("filename=(.+)", resp.headers['content-disposition'])[0]
        print(f"Fetching {filename}")

        with open(f"/tmp/{filename}", 'wb') as w:
            for chunk in resp.iter_content(1024):
                w.write(chunk)

        return filename

def upload(filename: str):
    with open(f"/tmp/{filename}", 'rb') as f:
        resp = requests.post(f"http://127.0.0.1:8001/{filename}", files={filename: f})
        if resp.status_code == requests.codes.ok:
            print(f'File {filename} uploaded')
        else:
            print(f'Error when uploading file {filename}')
    os.unlink(f"/tmp/{filename}")

def routine():
    while running:
        upload(fetch())

if __name__ == "__main__":
    pool = []
    for _ in range(8):
        pool.append(threading.Thread(target=routine))
        pool[-1].start()

    try:
        while True:
            time.sleep(100)
    except KeyboardInterrupt:
        running = False

    for t in pool:
        t.join()

```

<figure>

![](<./assets/image (51).png>)

<figcaption></figcaption></figure>

<figure>

![](<./assets/image (52).png>)

<figcaption></figcaption></figure>

Yet, threads are still need to wait until their I/O finishes. We can use more threads to relieve such an issue, but this will introduce overhead in OS side.

## Asynchronous I/O Approach - Workers and Jobs

Since we already have multiple threads, and we do not want them to wait, instead of blocking them for I/O operations, we make them working on other jobs, such as processing other files.&#x20;

A **worker** is a dispatch unit (thread) that are working on some **jobs**, and a **job** is a unit of the actual work the program needs to do (in this case, migrating one single file).

By declaring a function to be **async**, it becomes a **coroutine**, which means it can be _suspended_ and _resumed_. We can use **await** to call another coroutine inside a coroutine. This keyword means the coroutine can be paused here.

Hence, in this scenario, whenever the program hits **await** and needs to wait for an I/O to finish, the program immediately pauses the job and works on another one that is ready.

```python
import asyncio
import aiohttp
import aiofiles
import re
import os

async def fetch() -> str:
    async with aiohttp.ClientSession() as session:
        async with session.get("http://127.0.0.1:8000") as resp:
            resp.raise_for_status()
            filename = re.findall("filename=(.+)", resp.headers['content-disposition'])[0]
            print(f"Fetching {filename}")

            async with aiofiles.open(f"/tmp/{filename}", 'wb') as w:
                async for chunk in resp.content.iter_chunked(1024):
                    await w.write(chunk)

            return filename

async def iter_file(filename: str):
    async with aiofiles.open(f"/tmp/{filename}", 'rb') as f:
        chunk = await f.read(1024)
        while chunk:
            yield chunk
            chunk = await f.read(1024)

async def upload(filename: str):
    async with aiohttp.ClientSession() as session:
        async with session.post(f"http://127.0.0.1:8001/{filename}", headers={"content-length": str(os.path.getsize(f'/tmp/{filename}'))}, data={filename: iter_file(filename)}) as resp:
            if resp.status == 200:
                print(f'File {filename} uploaded')
            else:
                print(f'Error when uploading file {filename}')
    os.unlink(f"/tmp/{filename}")

async def routine():
    await upload(await fetch())

async def main():
    while True:
        asyncio.create_task(routine())
        await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(main())

```

It precisely made a request in every 5 seconds, while still download & uploading multiple files, which is what threading cannot achieve.

<figure>

![](<./assets/image (56).png>)

<figcaption></figcaption></figure>

<figure>

![](<./assets/image (55).png>)

<figcaption></figcaption></figure>

## Multiple workers

Without threading, a program cannot run on different cores simultaneously on one CPU. So mulitple workers are still required to achieve maximum performance. In this example, we have 8 workers.

<figure>

![](<./assets/image (59).png>)

<figcaption></figcaption></figure>

```python
async def main():
    while running:
        asyncio.create_task(routine())
        await asyncio.sleep(20)

def worker():
    loop = asyncio.new_event_loop()
    loop.run_until_complete(main())

if __name__ == "__main__":
    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()

    try:
        while True:
            time.sleep(100)
    except KeyboardInterrupt:
        running = False

    for t in threads:
        t.join()
```

## Throttling the traffic - Semaphore

In practice, we do not want to make the job sleep and make a request in a period. We want to make the program as efficient as possible. But we cannot just delete asyncio.sleep function call, as it is the only way to pause the main() coroutine and passes the worker to other jobs.

So we need to make it to only sleep for a tiny amount of time. Yet this will make the program generating a bulk of requests (thousand of?) and create congestion in network traffic. Hence we need a way to limit the amount of jobs.

A Semaphore is a thread-safe integer value that block a thread whenever there is no resources available. We are limiting the maximum number of jobs to 10.

Note that asyncio have its own semaphore implementation, but it is not thread-safe. So it can only be used within the same event loop.

```python
sem = threading.Semaphore(10)

async def routine():
    sem.acquire()
    await upload(await fetch())
    sem.release()

async def main():
    while running:
        asyncio.create_task(routine())
        await asyncio.sleep(0.1)

```

## Remove the I/O bottleneck - Piping

In all of our codes, we assumed that a disk I/O is required when moving between online disk. Yet, when we transfer data between two physical drive, we do not copy them to a third drive first. We only move data through the memory.

We can combine the fetch and upload coroutine into one, so that we can do both operations at the same time, without disk I/O.

```python
async def routine():
    with sem:
        async with aiohttp.ClientSession(version = aiohttp.http.HttpVersion10) as src_session, aiohttp.ClientSession(version = aiohttp.http.HttpVersion10) as dst_session:
            async with src_session.get("http://127.0.0.1:8000") as src_resp:
                src_resp.raise_for_status()
                filename = re.findall("filename=(.+)", src_resp.headers['content-disposition'])[0]
                print(f"Fetching {filename}")
                async with dst_session.post(f"http://127.0.0.1:8001/{filename}", headers={"content-length": src_resp.headers['content-length']}, data=src_resp.content.iter_chunked(1024)) as dst_resp:
                    if dst_resp.status == 200:
                        print(f'File {filename} uploaded')
                    else:
                        print(f'Error when uploading file {filename}')
```

<figure>

![](<./assets/image (6) (1).png>)

<figcaption></figcaption></figure>

