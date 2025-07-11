---
title: Reverse Engineering Techniques - Detect open source Libraries and its functions
pubDate: 2022-05-01
---

## 【逆向技巧总结】 对开源库函数的手动识别

在各种逆向工程项目以及CTF竞赛题目中，很多都会用到开源库，例如LuaJIT中集成的Lua解释器，和OpenSSL、zlib等常用的库。很多库都有十分复杂的逻辑，在逆向过程中如果详细的去分析便会加大很多工作量，而且很多的逻辑会应用到数学、密码方面的知识，如果缺乏这些理论知识基本没有办法去逆向这些程序。那么这时候对于各种库函数的识别便会变得十分重要，这篇文章主要介绍两种方式对开源库函数进行识别。

### 思路

首先说一下大体的思路，我们既然找到了开源库，那么在程序中用到的很多函数的代码逻辑基本上和库里是相同的。也就是说，我们拿到了程序的部分源代码，但是并不知道这些源代码分别对应程序中的哪一个部分。如果我们可以找到对应的函数，就可以通过查阅开源库的源代码、函数名（符号）、开发文档去了解函数的功能。本篇文章要介绍的两种方式均是以这种思路去展开。

### 自动化分析 - BinDiff

BinDiff是一款用于比对IDA数据库中的函数代码相似度的自动化工具，识别出的代码相似度越高，实现相同逻辑的可能性就越大。换句话说，就是将函数名与程序中的函数体进行匹配的工具。

#### 环境安装

**Java SE Development Kit**

首先需要安装JDK，笔者这里用的是JDK 11，在Oracle的官网即可下载安装。

可根据需要选择相应的版本：[https://www.oracle.com/java/technologies/downloads/](https://www.oracle.com/java/technologies/downloads/)

**IDA Pro**

BinDiff是通过IDA生成的数据库进行的匹配，IDA Pro产品需要购买才可使用，是一款十分强大的逆向工具，笔者这里使用的是IDA 7.6版本。

官方网站地址：[https://hex-rays.com/ida-pro/](https://hex-rays.com/ida-pro/)

**BinDiff**

官方下载地址在此，根据系统和环境的版本选择即可：[https://www.zynamics.com/software.html’](https://www.zynamics.com/software.html%E2%80%99)

注意：安装过程中会让你选择IDA的路径，此时要选择你的IDA工具（ida.exe/ida64.exe）的所在目录

#### 使用方法

若要使用BinDiff工具，需要提供另一个idb数据库作为比对。

在此我们首先使用IDA打开被分析程序的数据库，然后File->BinDiff中选择要比对的idb数据库即可

等待一段时间后便可以在Matched Functions中得到匹配结果。
![](<./assets/image (42).png>)


在左侧的sub\_XXXX这些没有被命名的函数便可以通过这种方式找出对应的函数名。

#### 示例

在这里使用Defcon Final 2021 - Barb Metal举例。（题目地址：[https://github.com/o-o-overflow/dc2021f-barb-metal-public](https://github.com/o-o-overflow/dc2021f-barb-metal-public) ）

这道题使用了mrubyc库实现了一个虚拟机，并对虚拟机的代码进行了加密，题目要求在虚拟机代码中寻找漏洞得到flag。

在此我们只进行相关库的匹配。

第一步是寻找库的特征，例如OpenSSL中的字符串，编译时添加的Assertion信息等，通过这些信息定位到具体使用了哪个开源库。

直接在IDA中进行字符串的查找，可以得到以下结果，有很多的代码路径信息。


![](<./assets/image (15).png>)![](<./assets/image (7) (2).png>)


直接进入Google搜索LibTomMath、mrubyc，以及代码的路径信息。

得到以下三个开源库，均托管在Github：

* LibTomMath([https://github.com/libtom/libtommath](https://github.com/libtom/libtommath))
* LibTomCrypt([https://github.com/libtom/libtomcrypt](https://github.com/libtom/libtomcrypt))
* mrubyc([https://github.com/mrubyc/mrubyc](https://github.com/mrubyc/mrubyc))

第二步，将开源库编译成相同架构的二进制库文件，这里是Linux下的x86架构程序


![](<./assets/image (25).png>)


这里要注意的有两点，第一点是一定要在32位环境下编译（如果在64位环境下需要在CFLAG上加-m32参数），因为我们要逆向的文件是32位的。第二点是，如果要在比较方便的情况下使用BinDiff，就需要将静态链接库（ar）转化为动态链接库（so），因为静态链接库实质是一个压缩包，里面有很多编译后的库文件，那么每个库文件就需要一个idb去存储它的代码信息。而动态链接库只需要一个idb即可，因此我们尽量使用动态链接库的方式生成二进制文件。

修改Makefile文件，以mrubyc为例



这样make后的结果便是libmrubyc.so这一个动态链接库文件

以此类推，继续编译LibTomCrypt和LibTomMath库，最终我们得到了三个so文件
![](<./assets/image (10) (2).png>)![](<./assets/image (43).png>)


分别导入IDA生成对应的idb，使用BinDiff选中进行分析

但是对于libTomCrypt和libTomMath，BinDiff便有些鸡肋了。


![](<./assets/image (1) (2).png>)![](<./assets/image (38).png>)


通过BinDiff，我们的分析便会变得十分简单，例如如下函数


![](<./assets/image (28).png>)


同时mrubyc的opcode也一清二楚

对于BinDiff就介绍这么多，这款自动化工具十分好用，对于各种开源库的识别十分有帮助，当然，选择开源库的版本也十分重要，最好是要让所有库的版本都和待逆向程序的版本相同，这样才能提高匹配度。

> 当时做这道题的时候还没有学会使用BinDiff，而且通宵比赛，我的体力也跟不上，几个小时只能勉强逆向出这一堆opcode，后面和源码一比较发现什么都没变，也就是说我这几个小时什么都没逆出来。。。
>
> 后来pizza醒了，把idb传到队伍里之后趴在桌子上歇了一会儿，估计pizza看到我这idb要气疯了（逃

### 手动分析 - 对照源码

如果BinDiff这种自动化工具不是很有效的匹配函数，那么我们只能通过手动的对照源代码来分析每个函数的作用了。

拿刚刚的LibTom举例，我们可以得到的信息有源码所在目录和文件，甚至是本行的代码或是Assertion信息，有的函数说不定直接把函数名信息写在了里面。通过这些信息去定位源代码的位置函数，可以用来匹配函数符号。


![](<./assets/image (24) (2).png>)


不过这种情况在CTF的逆向中比较少见（除非题目侧重点不在逆向上面），这时候程序本身的逻辑便会显得十分重要，不论怎么改变函数名、源代码，函数的逻辑不会产生变化。而通过人工直接分析函数逻辑，便可以在信息不足的情况下定位函数。接下来要演示通过函数本身的特性手动分析的方法。

#### 示例

本题基本没有任何的信息可供查找（出题人甚至将函数本身可以追溯到源代码的某些特性删除了），那么我们首先从main函数入手。


![](<./assets/image (33).png>)


可以大概浏览伪代码，程序首先打印出key，然后将data.txt加密存入enc.dat中，再用字符串FLAG分割，写入经过sub\_E9F和sub\_C06E变换的key。

但是进入任何一个函数，逻辑都十分复杂，根本没有办法看懂。

因此我们从可以看到的常量值下手，首先从上往下看，首先进入sub\_B91F，里面有两块数据，但很遗憾经过搜索里面的数据都没有信息表明是哪个算法。

那么进入sub\_B7BC，可以看到简单的逻辑，再进入sub\_B714看下它进行了什么变换

将a1类型修改为\_DWORD\*，因为根据前文分析a1是一个整型数组。

<figure>

![](<./assets/image (29).png>)

<figcaption></figcaption></figure>

0x312 0x212 0x12 0x112这些值看起来很特殊，那么我们搜索这些值尝试一下。

找到了加密算法来源，是任天堂DS的算法。

[https://github.com/RocketRobz/NTR\_Launcher\_3D/blob/master/twlnand-side/BootLoader/source/encryption.c](https://github.com/RocketRobz/NTR_Launcher_3D/blob/master/twlnand-side/BootLoader/source/encryption.c)

根据对照源代码，可以得到以下函数映射

> sub\_B91F -> apply\_keycode
>
> sub\_B7BC -> crypt\_64bit\_up

而上面那两个数据集，如果仔细分析源代码和该程序的逻辑后发现，无非是将自身的key写入了一个sbox中，后面的一大堆数据甚至根本都没有用到，这两个数据集实际上是对我们逆向的一个干扰。

退回到main函数，找到加密逻辑sub\_CB0


![](<./assets/image (18).png>)


sub\_B86E是什么实际上已经没有任何意义了，因为v15是我们加密后的数据，而sub\_B86E对其一点影响都没有，不过根据逻辑对照后这个函数其实是将刚刚加密的数据解密回去。。。不知道出题人为什么要加入这个函数。

下图两个函数都是将unsigned int四个字节的大端序和小端序进行交换，实际上就是上面源代码的bswap\_32bit函数逻辑。


![](<./assets/image (21) (2).png>)


接下来思路就十分明显了，首先想办法解密key，再将生成的sbox Dump下来，再进行解密即可。

解密逻辑如下。

```python
def crypt_64bit_down(x, y):
    for i in range(0x11, 1, -1):
        z = sbox[i] ^ x
        x = sbox[0x012 + ((z>>24)&0xff)];
        x = sbox[0x112 + ((z>>16)&0xff)] + x;
        x = sbox[0x212 + ((z>> 8)&0xff)] ^ x;
        x = sbox[0x312 + ((z>> 0)&0xff)] + x;
        x = y ^ x
        y = z
    x = x ^ sbox[1]
    y = y ^ sbox[0]
    return (x, y)

def byteswap32(a):
    return (a >> 8) & 0xFF00 | (a << 8) & 0xFF0000 | (a << 24) & 0xFF000000 | (a >> 24) & 0xFF

for i in range(0, len(encbuf), 2):
    a, b = encbuf[i], encbuf[i+1]
    a, b = crypt_64bit_down(byteswap32(a), byteswap32(b))
    a = byteswap32(a)
    b = byteswap32(b)
    encbuf[i: i+2] = [a, b]
```

接下来回到main函数，跟踪sub\_2200->sub\_1CB0，这个函数很大，不过有一些关键变量可以让我们进行搜索

放入Google搜索得到MIRACL库的结果，源码在此[https://github.com/miracl/MIRACL/blob/master/source/mrcore.c](https://github.com/miracl/MIRACL/blob/master/source/mrcore.c)

我还找到了看雪上不错的一篇文章( [https://bbs.pediy.com/thread-222568.htm](https://bbs.pediy.com/thread-222568.htm) )，专门讲了如何识别MIRACL的库函数，只可惜这道题把文章中说到的函数的特征去掉了，所以没办法通过这篇文章的思路进行识别了。

那么我们直接编译好拖进BinDiff，不过很遗憾，识别率低的出奇，根本没办法参考


![](<./assets/image (1) (1) (2).png>)![](<./assets/image (11) (2).png>)


不过我们编译好的so文件也不是没有用处的，用IDA打开，第一件事搜索关键值，得到我们函数的名称为mirsys\_basic，接下来对照符号表，将so文件对应的函数填入我们逆向的程序中


![](<./assets/image (41).png>)


接下来跟进每个函数中，根据判断条件、调用函数等函数逻辑继续给函数重命名，例如这个函数用到了0x80000000这个值，直接搜索，跟进每一个函数自己看代码相似度


![](<./assets/image (13).png>)![](<./assets/image (4) (2).png>)![](<./assets/image (37).png>)


猜测其为convert函数，接下来以此类推，用X交叉引用，查到这两个函数很相似，尤其是那个调用参数1

继续向下看，基本可以断定这两个函数完全一样，命名为mr\_jsf，然后将copy add sub subdiv mr\_addbit premult等函数也识别了出来，以此类推继续识别到cinstr函数

<img src="./assets/image (35).png" alt="" data-size="original">
![](<./assets/image (40).png>)


这里有一个小技巧，我们既然识别到了mr\_berror函数，这个函数在很多函数中进行了调用，但是调用次数很少，都在1-5次之间，那么我们可以用交叉引用判断它再程序中调用的次数和位置，再看它的参数（例如此处的3）即可判断这个函数到底是什么名字。

例如很复杂的sub\_6370函数，调用了两次，值分别为10和7


![](<./assets/image (36).png>)


找调用两次并且参数均为10和7的函数


![](<./assets/image (9).png>)


通过手动分析基本可以断定其为powmod函数。

以此类推，分别恢复符号。


![](<./assets/image (12).png>)


那么加密的逻辑就是以下结果

很简单的逻辑，接下来继续回到main函数的sub\_C06E函数\


<figure>

![](<./assets/image (6) (1) (1).png>)

<figcaption></figcaption></figure>

经过搜索和识别很明显是base58算法，字典被改为

```
9876432*Flag{n0T-EA5y=to+f1Nd}BCDGHJKLMPQRSUVWXYZbcehijkmp
```

那么一下代码即可得到key的值，开三次整数平方根即可（在此使用gmpy2工具，[在文章的附录中对此有展开说明](http://127.0.0.1:4000/2021/11/24/239b3175dd5d/#%E9%99%84%E5%BD%95%EF%BC%9A%E5%AF%B9%E4%BA%8E%E5%BC%80%E4%B8%89%E6%AC%A1%E6%95%B4%E6%95%B0%E7%AB%8B%E6%96%B9%E6%A0%B9%E7%9A%84%E6%80%9D%E8%80%83)）

```python
STANDARD_ALPHABET = b'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
CUSTOM_ALPHABET = b'9876432*Flag{n0T-EA5y=to+f1Nd}BCDGHJKLMPQRSUVWXYZbcehijkmp'

with open("./enc.dat.bak", "rb") as f:
    buf = f.read()

encrypted, key = buf.split(b"FLAG")

key = base58.b58decode(key.translate(bytes.maketrans(CUSTOM_ALPHABET, STANDARD_ALPHABET)))

print("Key: " + int(gmpy2.iroot(int.from_bytes(key, "big"))[0]).to_bytes(8, "big").decode())

# Key: N5f0cuS_

```

通过调试，将key的值更改掉，然后待程序生成好sbox之后去将其dump下来，得到sbox.bin

接下来就是笔者的完整解题脚本：

```python
import base58
import struct
import gmpy2

STANDARD_ALPHABET = b'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
CUSTOM_ALPHABET = b'9876432*Flag{n0T-EA5y=to+f1Nd}BCDGHJKLMPQRSUVWXYZbcehijkmp'

with open("./enc.dat.bak", "rb") as f:
    buf = f.read()

encrypted, key = buf.split(b"FLAG")

key = base58.b58decode(key.translate(bytes.maketrans(CUSTOM_ALPHABET, STANDARD_ALPHABET)))

print("Key: " + int(gmpy2.iroot(int.from_bytes(key, "big"))[0]).to_bytes(8, "big").decode())

# Key: N5f0cuS_

with open("./sbox.bin", "rb") as f:
    buf = f.read()

it = struct.iter_unpack("<I", buf)
sbox = []
while True:
    try:
        sbox.append(next(it)[0])
    except StopIteration:
        break

def crypt_64bit_down(x, y):
    for i in range(0x11, 1, -1):
        z = sbox[i] ^ x
        x = sbox[0x012 + ((z>>24)&0xff)];
        x = sbox[0x112 + ((z>>16)&0xff)] + x;
        x = sbox[0x212 + ((z>> 8)&0xff)] ^ x;
        x = sbox[0x312 + ((z>> 0)&0xff)] + x;
        x = y ^ x
        y = z
    x = x ^ sbox[1]
    y = y ^ sbox[0]
    return (x, y)

def byteswap32(a):
    return (a >> 8) & 0xFF00 | (a << 8) & 0xFF0000 | (a << 24) & 0xFF000000 | (a >> 24) & 0xFF

it = struct.iter_unpack("<I", encrypted)
encbuf = []
while True:
    try:
        encbuf.append(next(it)[0])
    except StopIteration:
        break

for i in range(0, len(encbuf), 2):
    a, b = encbuf[i], encbuf[i+1]
    a, b = crypt_64bit_down(byteswap32(a), byteswap32(b))
    a = byteswap32(a)
    b = byteswap32(b)
    encbuf[i: i+2] = [a, b]

data = b''
for i in range(0, len(encbuf), 2):
    data += struct.pack("<I", encbuf[i+1])
    data += struct.pack("<I", encbuf[i])

print(data.decode())


```

至此程序逆向完成，flag成功被打印出来。

### 总结

本篇文章主要介绍了两种对开源库进行识别的方法，这种方法在逆向工程中较为重要，希望能给大家带来帮助。

### 附录：对于开三次整数立方根的思考

首先Python自己就可以开三次立方根，甚至更大的根式

那么问题来了，为什么要用gmpy2这个库去开立方根，直接使用Python不就好了？

问题就在这里，因为Python算出来的结果不够精确，没有办法直接得到Key的值。甚至于输入0.1+0.2，Python会给出0.30000000000000004的结果（众所周知）。

我们试一下题目中的数字（0x74ca162812ee5cd010dacbbffa4b0d1dc82d9ca87db4e1f）开三次根式

结果是一个浮点数，而我们的key是整数输入，结果肯定不相等，原因就是Python进行根式的计算不够精确。不过对于做题来讲也足够了，如果直接使用Python进行计算的话，可以将其强制转为整型再进行爆破，结果是0x4e35663063752000。而我们的正确结果的值为0x4e3566306375535f，相差并不是很大。


![](<./assets/image (39).png>)


直接爆破也可以得到正确结果。

但是这样的话，如果遇到非常大的数，产生很大的误差，要怎么处理呢？除了导入库之外是不是还有其他的方法去计算？

答案肯定是有的，不然这么多优秀的数学计算工具就不会存在了。

接下来介绍两种求根的算法，参考资料来自知乎[https://zhuanlan.zhihu.com/p/112845185](https://zhuanlan.zhihu.com/p/112845185)

#### 传统二分查找法

三次根式函数是在(-∞, +∞)上的连续单调函数，而我们的方程是f(x) - 0x74ca162812ee5cd010dacbbffa4b0d1dc82d9ca87db4e1f = 0

那么我们定义y = f(x) - 0x74ca162812ee5cd010dacbbffa4b0d1dc82d9ca87db4e1f，y在(0, n)上一定有一个根存在，那个根即为我们所要的解。

我们知道y函数是单调递增的，那么我们折半，然后分析这个值与我们的根式相比是大还是小，如果大了就向左边的区间(0, n/2)查找，小了就向右边的区间(n/2,n)查找，连续进行二分查找，总会一直逼近我们所要求得的根值。

e为精确度，如果我们的结果在精确度以内即返回。

```python
def cubicRoot(n) :
    start = 0
    end = n
    e = 0.00000001
    while (True) :
        mid = (start + end) / 2
        error = abs(n - (mid * mid * mid))
        if (error <= e) :
            return mid
        if ((mid * mid * mid) > n) :
            end = mid
        else :
            start = mid


```

但是这种算法对于大数的处理很不友好，例如这里如果我使用这种方法跑脚本，需要跑非常久的时间。

#### 牛顿迭代法

牛顿迭代法也是一种非常棒的算法，但是很遗憾，这种算法并不可以用于计算三次根式。因为三次根式的函数如果使用牛顿迭代法是不能收敛的，如果使用牛顿迭代法只会越走越偏。

#### 特殊情况：三次根式整数解二分查找

既然我们知道根式的解是整数，那么我们把二分查找的范围限制在整数上，不就可以得到精确的解了吗？

确实是这样，如果将范围限制在整数上，那么我们就可以放弃浮点数的结果，大大减少了计算量。

不过这里做了一点小小的优化，将范围进行了缩小，不过hi变量的值设置为n也没有关系。

这种算法只能求整数解，如果放在浮点数上，结果就不是很精确了。

代码来自[https://stackoverflow.com/questions/23621833/is-cube-root-integer](https://stackoverflow.com/questions/23621833/is-cube-root-integer)

```python
def find_cube_root(n):
    lo = 0
    hi = 1 << ((n.bit_length() + 2) // 3)
    while lo < hi:
        mid = (lo+hi) >> 1
        if mid**3 < n:
            lo = mid+1
        else:
            hi = mid
    return lo

```

将这种算法应用在题目中：


![](<./assets/image (5) (1) (1).png>)


可以直接得到key的值，就不用去爆破了。

### 附件

[题目](https://github.com/MTAwsl/blog.github.io/raw/Hexo-OldBlog/2021/11/24/239b3175dd5d/prog)

[IDB](https://github.com/MTAwsl/blog.github.io/raw/Hexo-OldBlog/2021/11/24/239b3175dd5d/prog.i64)

[解题脚本](https://raw.githubusercontent.com/MTAwsl/blog.github.io/Hexo-OldBlog/2021/11/24/239b3175dd5d/solve.py)
