---
title: Analyzing Mi-Home Protocal
pubDate: 2021-06-01
---

## 米家智能家居协议分析

对米家协议的抓包教程和DIY项目已经很多了，但并没有发现网络上有很多对这种协议的具体分析，导致对于具体需求的代码写起来非常费劲甚至有时需要逆向工程，本文对米家的整体协议做一个具体的分析:)

### 数据包协议

对于米家这种面向消费者的大型项目，数据的安全性一定要得到保证。例如米家的摄像头配对后，传输的数据要保证不被第三方从中间手段获取，于是就有了加密后的数据包。

从设计角度来讲，构造一个数据包，首先需要从数据包内容中识别出智能家居支持米家，所以一定要有一个数据包头，在米家协议中是0x2131(Magic Number)，数据包的长度也要提供。接下来是安全方面的考量，数据包中要包含该设备的唯一识别码、时间戳、密钥、数据包的校验和（Checksum）以及最重要的——数据本身。

根据以上信息，给出米家数据包头的具体格式便很容易理解。

```c
struct miioheader{
    uint16_t magic = 0x2131; // Magic Number
    uint16_t length; // 长度
    uint32_t pad_unk = 0x0; // 目前未知，但具体使用时基本置零
    uint32_t DID; // 设备识别码
    uint32_t stamp; // 数据包时间戳
    union {
        uint8_t token[16]; // 该设备的密钥
        uint8_t chksum[16]; // 校验和
    }
};
```

### 握手协议（SmartConnect）

**Hello Packet**

米家的网络传输协议基于UDP，那么对于设备的识别就会变得容易，因为我们可以\<broadcast>地址通过网关（家庭路由器或智能网关）直接向局域网中的全部设备广播一个识别数据包，进行有效回显的设备即为支持米家的设备。这个数据包的名字叫做称为Hello Packet。

```mermaid
sequenceDiagram
Client->>Device: Hello Packet
%% activate
Device->>Client: Something about Device itself.
```

设备给我们的回显包含了设备的基本信息，当然，对于Hello Packet来讲，数据只包括上文提到的包头。

发送的Hello Packet内容：

```c
struct miioheader{
    uint16_t magic = 0x2131; // Magic Number
    uint16_t length = 0x20; // 长度
    uint32_t pad_unk = 0x0; // 目前未知，但具体使用时基本置零
    uint32_t DID = 0xFFFFFFFF; // 设备识别码
    uint32_t stamp = 0xFFFFFFFF; // 数据包时间戳
    union {
        uint8_t token[16]; // 该设备的密钥
        uint8_t chksum[16]; // 校验和
        uint128_t hello = 0xffffffffffffffffffffffffffffffff;
    } // 用FF填充
};
```

回显内容中，DID被替换为设备的识别码，Stamp被替换为当前设备的时间戳，Token字段返回设备的Token。

**注意：在2017-02-23年后的固件中，只有设备第一次配对才会返回设备的Token，其余的Hello Packet回显中该字段均以FF填充。如果已经配对，可以使用您的米家账户在小米云端**[**直接获取设备Token**](https://github.com/PiotrMachowski/Xiaomi-cloud-tokens-extractor)**或重置设备。**

### 数据加密

米家的数据加密使用AES-128-CBC算法，使用PKCS7作为数据填充的方式，加密的密钥和IV矢量如下。

```
Key = MD5(Token);
IV  = MD5(MD5(Key) + Token);
```

在数据包头部以后，就是我们加密后的数据了，但在填充数据之后还要做一件很关键的事情——修改包头。在米家协议中对数据包头的验证很严格，我们首先需要填写当前数据包生成的时间（相对设备时间戳，但一般应用中为设备时间戳+1）需要用Token填充好Checksum字段（Token字段），然后对整个数据包进行MD5校验，生成的MD5重新写入Checksum字段。

做好这一切后，即可向指定地址的设备发送数据了。

```mermaid
graph LR;

指令数据--AES加密-->sum[校验和]
数据头初始化--填入时间戳和Token-->sum[校验和]-->发送
```

### 设备控制协议（指令传输）

设备控制协议较为简单，为JSON格式，包含

* id字段，即为当前指令的序号（通常为1）。
* method字段，为当前指令名称。
* params字段，为当前指令所需的参数。

由于实现过程中此部分比较简单，并且每个设备的具体method和param也基本不同（可以理解为函数调用），因此笔者并没有对此下过多的功夫研究，本文提供示例如下：

```json
{
    "id": 1,
    "method": "set_properties",
    "params": [
        {
            "did": "state",
            "value": true
        }
    ]
}
```

### 参考信息

协议说明：https://github.com/OpenMiHome/mihome-binary-protocol/blob/master/doc/PROTOCOL.md

小米云端Token提取器：https://github.com/PiotrMachowski/Xiaomi-cloud-tokens-extractor

笔者的一些项目：

* https://github.com/Socular/Gosund-Plug-Remote-Switch
* https://github.com/Socular/Mihome-Gosund-Plug-API
