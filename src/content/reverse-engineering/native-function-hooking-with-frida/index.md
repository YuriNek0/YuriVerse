---
title: Native function hooking with Frida
pubDate: 2025-03-09
---

## Background

I have some certain device that uses a generic driver, which is included in Linux and Windows. But there is no such driver on MacOS. So I started to find a driver and I found a working one. Then I realized they will charge me $59 US dollar per year, and since this driver is unstable, I don't want to pay for it.

I decided to put my reverse engineering skill into use. After digging inside of the binary, I found it is really easy to patch the binary and bypass the verification. But why not try some new tools that I haven't used before? (I haven't reversing on a mac before, especially a ARM one)

Frida is a framework used by a lot of mobile reverse engineers, and it supports ARM architecture pretty well. It can use javascript to make the hooking easier. ([https://frida.re/](https://frida.re/))

## Disabling MacOS SIP temporarily

After some retrial, I found I couldn't attach the debugger (LLDB) to the running binary. This is because of the security mechanism on MacOS (SIP). To disable it, we need to reboot into the recovery mode, and then run this command.

```
# csrutil enable --without debug
```

This will turn off the debug protection of SIP. But it is not a good practice to turn off SIP once and for all. So after we finished our work, we should:

```
# csrutil enable
```

## Frida Interceptor

To hook a function, we can use frida's interceptor module, and it can map function argument into javascript pretty well (if the function uses standard calling convention).&#x20;

Even if the function uses custom calling convention, we can get the arguments by access the registers manually as well.

For more information, please check frida's API document [https://frida.re/docs/javascript-api/#interceptor](https://frida.re/docs/javascript-api/#interceptor).

## Grab log messages

In this driver application, there is a hidden logging operation. It will be really helpful if we can extract these logging messages even when the debug option has turned off.

<figure>

![](<./assets/Screenshot 2025-05-09 at 9.07.09 pm.png>)

<figcaption></figcaption></figure>

To hook this function in frida, we need to know its function signature. IDA has parsed the symbol for us.

<figure>

![](<./assets/Screenshot 2025-05-09 at 9.05.55 pm.png>)

<figcaption></figcaption></figure>

We can use the code below to read the log out. And then execute it with `frida -l script.js -f <binary>` .

```javascript
const log_addr = Process.getModuleByName("modulename").findSymbolByName('_ZN6******LoglsEPKc');
const log_func = new NativeFunction(log_addr, "uint64", ["uint64", "pointer"])
<strong>
</strong><strong>Interceptor.attach(log_func, {
</strong>  onEnter(args) {
    console.log("Log: " + args[1].readCString());
  }
});
```

## Find string comparison for license check

The license check logic used a lot of string comparison. We would like to know what string that it compared to.

<figure>

![](<./assets/image (5).png>)

<figcaption></figcaption></figure>

```javascript
const qtstrcmp = new NativeFunction(Module.findExportByName(qt_mod, '_ZN7QString14compare_helperEPK5QCharxPKcxN2Qt15CaseSensitivityE'), 'pointer', ['pointer', 'uint64', 'pointer', 'uint64', 'uint64'])
Interceptor.attach(qtstrcmp, {
    onEnter(args) {
        console.log("ViewCMP: " + args[0].readUtf16String() + "-///////-" + args[2].readCString())
    },
    onLeave(ret) {
    }
})

const qtstrcmpview = new NativeFunction(Module.findExportByName(qt_mod, '_ZN9QtPrivate14compareStringsE11QStringViewS0_N2Qt15CaseSensitivityE'), 'pointer', ['uint64', 'pointer', 'uint64', 'pointer', 'uint64'])
Interceptor.attach(qtstrcmpview, {
    onEnter(args) {
        console.log("ViewCMPPriv: " + Memory.readUtf16String(args[1], args[0].toInt32()) + "-///////-" + Memory.readUtf16String(args[3], args[2].toInt32()))
    }
       
    onLeave(ret) {
    }
})

```

Qt was used for string comparison. How do we read out QString? Simple, frida also supports **calling native functions**. Qt has a lot of functions to convert string objects into NSString.&#x20;

```javascript
function convertQStringToString(qStringInput){
    var tonsstr = new NativeFunction(Module.findExportByName(qt_mod, '_ZNK7QString10toNSStringEv'), 'pointer', ['pointer']);
    var str = ObjC.Object(tonsstr(qStringInput));
    return str;
}

function convertQStringViewToString(qstrview){
    var tonsstr = new NativeFunction(Module.findExportByName(qt_mod, '_ZNK11QStringView10toNSStringEv'), 'pointer', ['pointer']);
    var str = ObjC.Object(tonsstr(qstrview));
    return str;
}
```

## Check for the key data before hashing

Finally, we can hook the `QCryptographicHash::addData` to see what has been added into the hash.

```javascript
function qByteArrayAsString(arr) {
    return arr.add(0x8).readPointer().readCString()
}

const hashAddData = new NativeFunction(Module.findSymbolByName(qt_mod, '_ZN18QCryptographicHash7addDataERK10QByteArray'), 'pointer', ['pointer', 'pointer'])
Interceptor.attach(hashAddData, {
    onEnter(args) {
        console.log("Hash Add Data: " + qByteArrayAsString(args[1]));
    },
    onLeave(ret) {
    }
})

```

## Success

Unfortunately I could not write much about this specific software. But here, we successfully bypassed the hash check, and installed our own key!

<figure>

![](<./assets/image.png>)

<figcaption></figcaption></figure>

