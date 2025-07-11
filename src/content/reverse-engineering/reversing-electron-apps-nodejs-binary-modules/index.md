---
title: Reversing Electron Apps - NodeJS binary modules
pubDate: 2022-11-13
---

Despite we have a lot of electron apps are packages in ASAR format and we can easily unpack them to tamper the JavaScript inside of them, we still have to face a problem that some apps have  "Protections" that we cannot tamper with them easily. Most of them are packed with a binary module which has a ".node" extension.&#x20;

## What is a binary module?

Take a look at [Node-API](https://nodejs.org/api/n-api.html), which provides the functionality to the module for communicating with NodeJS. Lets say it is a tunnel to connect the binary code to the JavaScript engine. When the `require()` function is called, NodeJS will call `process.dlopen()` to load that module into the process address space. The `*.node` extension in `lib/internal/modules/cjs/loader.js` looks like this:

```javascript
// Native extension for .node
Module._extensions['.node'] = function(module, filename) {
  if (manifest) {
    const content = fs.readFileSync(filename);
    const moduleURL = pathToFileURL(filename);
    manifest.assertIntegrity(moduleURL, content);
  }
  // Be aware this doesn't use `content`
  return process.dlopen(module, path.toNamespacedPath(filename));
}
```

Then let's examine an actual sample module from[ this article](https://blog.s1h.org/inside-node-loading-native-addons/). This sample provides a native implementation of a `square()` function:

```cpp
#include <node_api.h>

napi_value square(napi_env env, napi_callback_info info) {
  napi_value argv[1];
  size_t argc = 1;
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);

  double value;
  napi_get_value_double(env, argv[0], &value);

  napi_value result;
  napi_create_double(env, value * value, &result);

  return result;
}

napi_value init(napi_env env, napi_value exports) {
  napi_value square_fn;
  napi_create_function(env, NULL, 0, square, NULL, &square_fn);

  napi_set_named_property(env, exports, “square”, square_fn);

  return exports;
}

NAPI_MODULE(square, init)
```

In the code above, we declared the module init and a function. And inside of the init function we created an export to the square function. Using the wrapper NodeJS provided, we can use NAPI to control all things on JavaScript sides. But how does the module loaded?

### NAPI\_MODULE Macro

Let's extract the NAPI\_MODULE macro.

```cpp
extern "C" {
  static napi_module _module = {
    1,
    flags,
    __FILE__,
    regfunc,
    “square”,
    priv,
    {0},
  };

  static void _register_square(void) __attribute__((constructor));
  static void _register_square(void) {
    napi_module_register(&_module);
  }
}
```

Instead of downloading all the symbols, the binary call \_register\_square itself to load the module by using the constructor attribute. On Windows, it is more simple, just iterating over the export directory and call the register functions, then the module is loaded.

## Practical Reversing with an encryption module

The module we will be reversed is packed by [this project](https://github.com/toyobayashi/electron-asar-encrypt-demo). So in this example, all of the js file is encrypted and could not be loaded without the binary module. Our goal is to reverse the module and extract the original data the javascript file contains.

Firstly, let's focus on the export directory. Only one export can be found as we can see. After digging into the struct we found its Initalizer. So let's call it "main" module.


![](<./assets/image (5) (2).png>)![](<./assets/image (8).png>)


Right after the module struct we can identify its Init function, in which it called another big function. Let's focus on the big function because the init function is just a wrapper of it.


![](<./assets/image (32) (2).png>)![](<./assets/image (3) (2).png>)


### Digging into the function hooking process

Inside of the function we can see a lot of stuff about anti-debugging, main module detection and other stuff, as it is harder to bypass since it's a binary module compared to a simple script. However, we can debug it using x64dbg to bypass the whole process. In this case, we can dig deeper into the binary.&#x20;

We can see that it run two scripts in JS scope, one is to find the entry module, the other is to make a require function.

<figure>

![](<./assets/image (6) (2).png>)

<figcaption></figcaption></figure>

Then it uses `napi_get_named_property`  `napi_create_function` `napi_define_properties` to detour the original \_compile function to its own C++ version.

<figure>

![](<./assets/image (24).png>)

<figcaption></figcaption></figure>

Inside myCompile function, it compare each module too see if it is come from app.asar. If not, we would decrypt the string buffer using some key in the binary module. In this case, sub\_180004606 is the decryption routine.

<figure>

![](<./assets/image (4) (3).png>)

<figcaption></figcaption></figure>

### Decrypt the JS module

Analyzing the decryption routine, we can see it used a constant key and a dynamic IV value to decrypt the data. And to generate the iv value, a random generator has been implemented.

<figure>

![](<./assets/image (2) (2) (1) (1).png>)

<figcaption></figcaption></figure>

The random generator's pseudo code is looked like this.

```cpp
_QWORD *__fastcall sub_180010A20(_QWORD *a1, int a2, int a3)
{
  int v6; // edi
  int i; // esi
  int v8; // edx
  int v9; // eax
  _BYTE *v10; // rdx
  char v12; // [rsp+A0h] [rbp+18h] BYREF

  v6 = 0;
  *a1 = 0i64;
  a1[1] = 0i64;
  a1[2] = 0i64;
  for ( i = 1; v6 < a3; i += 57 )
  {
    v8 = ((a2 + v6 * i) << 13) ^ (a2 + v6 * i);
    v9 = (int)(fabs(1.0 - (double)((v8 * (0x3D73 * v8 * v8 + 0xC0AE5) - 0x2DF722F3) & 0x7FFFFFFF)
                        * 9.313225746154785e-10)
             * 256.0);
    v12 = v9;
    v10 = (_BYTE *)a1[1];
    if ( (_BYTE *)a1[2] == v10 )
    {
      sub_180001163((__int64)a1, (__int64)v10, (__int64)&v12);
    }
    else
    {
      *v10 = v9;
      ++a1[1];
    }
    ++v6;
  }
  return a1;
}
```

So it is safe to introduce our own script to decrypt it.

```python
import binascii
import base64
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
from Crypto.Util.Padding import unpad

def hash(seed, length):
    i = 1
    result = bytes()
    for curPos in range(length):
        v8 = ((seed + curPos * i) << 13) ^ (seed + curPos * i);
        v9 = (int)(abs(1.0 - ((v8 * (0x3D73 * v8 * v8 + 0xC0AE5) - 0x2DF722F3) & 0x7FFFFFFF) * 9.313225746154785e-10) * 256.0);
        result += bytes([v9 & 0xFF])
        i += 57
    return result

with open("./atom.js", "r") as f:
    buf = f.read()
decoded = base64.b64decode(buf)
seed = ((len(decoded) % 256) ^ decoded[-1]) & 0xFF
iv = hash(seed, 16)
key = binascii.a2b_hex("---REDACTED KEY---")
crypted = decoded[:-1]
cipher = AES.new(key, AES.MODE_CBC, iv)
decrypted = cipher.decrypt(crypted)
unpadded = unpad(decrypted, 16)
print(unpadded.decode())
```

## Tampering the binary module

Apparently it is easier to tamper with the Javascript module because of its "free designing". However, it is easy to detect if a script file had been tampered. So instead of tampering with the script, let's focus on the binary module - the extractor.

### Locating the hook address

Let's focus on the `napi_run_script_wrapper` function. Usually, any function can be hooked and we just pick an easy and familiar one.

<figure>

![](<./assets/image (10) (3).png>)

<figcaption></figcaption></figure>

So, browsing with its assembly, the position we selected to hook is this one, as it contained 7 bytes and only takes one instruction without modifying any stack variable and EFLAGS.

<figure>

![](<./assets/image (21).png>)

<figcaption></figcaption></figure>

### The shellcode

The goal we want to achieve is to execute our javascript before the main module is loaded. In this case, the script we _inject_ is as follows, which hooked the JSON.parse function to our own for modifying the public key it returns. However, this method cannot use `require()` and if we want to use it, we need a very large shellcode which contains huge block of API calls to get the main module from `process.mainModule` and make our require function.&#x20;

```javascript
if (typeof _json_parse_orig == "undefined"){
    _json_parse_orig = JSON.parse;
    JSON.parse=function(text, reviver){
        if (text.indexOf('-----BEGIN PUBLIC KEY-----') != -1){
            return ['-----BEGIN PUBLIC KEY-----', 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuZHZL7PmWJSHRLD2rbKr', 'k740QD4tnw6vaN4xgYqtwSwPxgKyM1fl/JzrBvMgxibuJxuzu4FUOmnfvwb2eBDN', 'skCuWkTSKjK1LWI1SWA/N0VzEIWu78JLc538nyA3j4XlJnC06jyWfQM0eixBLIDE', 'ZJolL9aTzAQvVtrIBzcCyZKRVBo4eRnWoEtI/tWgxqqIKENrYydWcfQS+wPSzpK3', 'dixFFnmh+B981ygI8ZhTycBoVS0Z2Ny7K49i25Dv0hDNvDbaDwhdjvzs/8jg4wsq', 'DHDObWLuEh4cUTe2f30Tdykichmi0WRojioE1bQxvThE2oR2v2BHdWus0EH9y9hw', '5wIDAQAB', '-----END PUBLIC KEY-----'];
        }
        return _json_parse_orig(text, reviver);
    }
}
```

And our shellcode need to be constructed with two API function calls, `napi_create_string_utf8` and `napi_run_script`. Each function call needs to obey the [x64 calling convention](https://learn.microsoft.com/en-us/cpp/build/x64-calling-convention). Take notes that the volatile register value needs to be reversed, and if we are coding large function shellcode we may not use the Detour hook method but to use Trampoline method instead to protect the register and stack values.

```
EXTERN napi_create_string_utf8, napi_run_script, jmp_back
jscode: db `"undefined"==typeof _json_parse_orig&&(_json_parse_orig=JSON.parse,JSON.parse=function(B,I){return-1!=B.indexOf("-----BEGIN PUBLIC KEY-----")?["-----BEGIN PUBLIC KEY-----","MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuZHZL7PmWJSHRLD2rbKr","k740QD4tnw6vaN4xgYqtwSwPxgKyM1fl/JzrBvMgxibuJxuzu4FUOmnfvwb2eBDN","skCuWkTSKjK1LWI1SWA/N0VzEIWu78JLc538nyA3j4XlJnC06jyWfQM0eixBLIDE","ZJolL9aTzAQvVtrIBzcCyZKRVBo4eRnWoEtI/tWgxqqIKENrYydWcfQS+wPSzpK3","dixFFnmh+B981ygI8ZhTycBoVS0Z2Ny7K49i25Dv0hDNvDbaDwhdjvzs/8jg4wsq","DHDObWLuEh4cUTe2f30Tdykichmi0WRojioE1bQxvThE2oR2v2BHdWus0EH9y9hw","5wIDAQAB","-----END PUBLIC KEY-----"]:_json_parse_orig(B,I)})`,0x3B, 0x0
lenofcode: equ $-jscode-1 ; In NAPI the string length needs to be completely correct, or the API will fail and further calls with such APIs will populate errors.
shellcode:
    push rcx
    push rdx
    push rsi
    push r8
    push r9
    push rax
    sub rsp, 0x20
    mov rcx, qword [rcx]
    mov rcx, rsi
    lea rdx, [rel jscode] ; To make further address-fixing more easier using reletive addressing
    mov r8, lenofcode
    mov r9, rsp
    call [rel napi_create_string_utf8]
    mov rcx, rsi
    mov rdx, qword [rsp]
    lea r8, [rsp+0x8]
    call [rel napi_run_script]
    add rsp, 0x20
    pop rax
    pop r9
    pop r8
    pop rsi
    pop rdx
    pop rcx
    mov r8, 0FFFFFFFFFFFFFFFFh ; And don't forget the instruction(s) we overwritten.
    db 0xE9, 00, 00, 00, 00 ; relative jump

```

### Fixing the shellcode and Patch DLL

To patch the shellcode into the dll file, we need to add a section (Well, currently I have not written a guide for this but I will in the future. Ping me if I forgot to add the hyperlink xD) into its [PE structure](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format).&#x20;

Then we search the pattern of its function to locate the precise entry of it. And retrieve the IAT location of each function call using the `relative_call_to_absolute`routine. Finally we need to fix the call the jmp location for each function call in our shellcode. We need to get the location of each relative call and jmp instruction to fix.&#x20;

_P.S. Don't confuse with RVA, FOA and the file pointer._

```cpp
pesection& section = dll.AppendSection(".crack", hexData, sizeof(hexData));
uint16_t pattern[] = { 0x85, 0xC0, 0x75, 0x44, 0x48, 0x8B, 0x54, 0x24, 0x20, 0x4C, 0x8D, 0x44, 0x24, 0x28, 0x48, 0x8B, 0x0F, 0xFF };
auto relative_call_to_absolute = [&dll](byte* ptr, uintptr_t rva) -> uintptr_t {
	return rva + *(int32_t*)(ptr + 2);
};

auto fix_rel_call = [&dll](byte* ptr, uintptr_t rva, uintptr_t iat) {
	*reinterpret_cast<WORD*>(ptr) = 0x15FF;
	*(DWORD*)(reinterpret_cast<byte*>(ptr) + 2) = iat - rva;
};
auto fix_rel_jmp = [&dll](byte* ptr, uintptr_t rva, uintptr_t taraddr) {
	*ptr = 0xE9;
	*(DWORD*)(reinterpret_cast<byte*>(ptr) + 1) = taraddr - rva - 5;
};
uintptr_t hookFuncFoa = dll.searchPattern(pattern, 18) - 0x4B;
uintptr_t hookFuncRva = dll.findRVA(hookFuncFoa);
uintptr_t firstjmpFoa = hookFuncFoa + 0x23;
uintptr_t firstjmpRva = hookFuncRva + 0x23;
uintptr_t napi_create_string_utf8_iat = relative_call_to_absolute(dll.base + hookFuncFoa + 0x45, hookFuncRva + 0x45);
uintptr_t napi_run_script_iat = relative_call_to_absolute(dll.base + hookFuncFoa + 0x5C, hookFuncRva + 0x5C);
uintptr_t shellcodeRVA = section.head.VirtualAddress;
uintptr_t shellcodeFOA = section.head.PointerToRawData;
uintptr_t shellcode_entry_RVA = shellcodeRVA + 0x27E;
uintptr_t shellcode_entry_FOA = shellcodeFOA + 0x27E;
uintptr_t call_to_napi_create_string = shellcodeRVA + 0x2A0;
byte* call_to_napi_create_string_ptr = dll.base + shellcodeFOA + 0x2A0;
uintptr_t call_to_napi_run_script = shellcodeRVA + 0x2B2;
byte* call_to_napi_run_script_ptr = dll.base + shellcodeFOA + 0x2B2;
uintptr_t jmpbackaddr = shellcodeRVA + 0x2CB;
byte* jmpbackaddrPtr = dll.base + shellcodeFOA + 0x2CB;

fix_rel_call(call_to_napi_create_string_ptr, call_to_napi_create_string, napi_create_string_utf8_iat);
fix_rel_call(call_to_napi_run_script_ptr, call_to_napi_run_script, napi_run_script_iat);
fix_rel_jmp(jmpbackaddrPtr, jmpbackaddr, firstjmpRva+5);
memset(dll.base + firstjmpFoa, 0x90, 7); // Set nop
fix_rel_jmp(dll.base + firstjmpFoa, firstjmpRva, shellcode_entry_RVA);

std::ofstream outFile(path, std::ios::binary | std::ios::out | std::ios::trunc);
outFile.write(buf, dll.fileSize);
outFile.close();
```

After all of these, we can inject our script into the electron app. Better check the result using IDA and debug it before publish the patch!

## Reference

* [https://nodejs.org/api/n-api.html](https://nodejs.org/api/n-api.html)
* [https://blog.s1h.org/inside-node-loading-native-addons/](https://blog.s1h.org/inside-node-loading-native-addons/)
* [https://github.com/toyobayashi/electron-asar-encrypt-demo](https://github.com/toyobayashi/electron-asar-encrypt-demo)
* [https://learn.microsoft.com/en-us/cpp/build/x64-calling-convention](https://learn.microsoft.com/en-us/cpp/build/x64-calling-convention)
* [https://learn.microsoft.com/en-us/windows/win32/debug/pe-format](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format)
