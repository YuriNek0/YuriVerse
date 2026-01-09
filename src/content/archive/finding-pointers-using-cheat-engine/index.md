---
title: Finding pointers using Cheat Engine
pubDate: 2021-06-01
---

# How to Modify Memory (Using Tools)

(Translation by gemini)

To modify memory, we first need to know where the data is located—its memory address. The process of finding this address is called "addressing." So, how do we find these addresses?

Our "big brother" **CE** (Cheat Engine) solves this for us. CE is not just for memory modification; it also provides advanced features like debuggers. Here is what it looks like:


![](<./assets/image (31).png>)


When addressing, there are generally two scenarios: a known variable value or an unknown initial value. The former applies to data that provides direct numerical feedback, like *money* or *ammo counts*. The latter applies to data that doesn't show a direct number, such as *progress bars*, *health bars*, or *mana bars*.

## Known Variable Values

Let’s use the CE built-in tutorial (Tutorial-i386.exe in the CE installation directory) as an example. We want to modify **Health** and set it to 1000. In the program, every time we click *Hit me*, health decreases.


![](<./assets/image (34).png>)


Back in CE, we first need to tell it which process contains the memory we want to modify. You might guess this involves operating system permissions, and you'd be right. Additionally, CE cannot scan all memory at once (scanning 4GB of 32-bit memory takes a long time and leads to poor accuracy).

Select the process and click **Open**.


![](<./assets/image (4) (1) (1).png>)![](<./assets/image (1) (1) (1) (1).png>)

Since health is an integer, we assume its data type is a **4-byte integer** (4 Bytes). We search for "100".

*Note: When scanning for floating-point types, remember there are `float` and `double` types.*

The initial scan finds 43 memory addresses with the value 100. Next, we click *Hit me* in the tutorial; health drops to 93. We enter "93" in CE and click **Next Scan**. We are left with only one address. This is the one we want. Double-click it to add it to the **Cheat Table**, then change the value to 1000.


![](<./assets/image (18) (1).png>)


Click *Hit me* again, and you'll see the health starts decreasing from 1000. Modification complete!


![](<./assets/image (30).png>)

## Unknown Initial Value


![](<./assets/image (9) (1).png>)

In this case, we don't know the exact value, but we can find the address through changes. First, select **Unknown initial value** as the scan type.

This scans all values in memory. Next, we click *Hit me*. Feedback tells us the value decreased by 6. Scan using the method shown below.

*Note: If there is no specific feedback on the amount, choose **Decreased value**.*


![](<./assets/image (11) (1).png>)![](<./assets/image (6) (1) (1) (1).png>)![](<./assets/image (25) (1).png>)![](<./assets/image (14).png>)

After searching, we might find 7 data points. Repeat the steps.

Ultimately, we find 4 addresses. Clearly, the most reliable address is `01931610`.

*Note: The other three values starting with 429 will revert to their original values after clicking "Hit me", while 115 remains valid.*


![](<./assets/image (20).png>)

Change it to 5000, and the modification is done.

## Summary

During the scanning process, your only goal is to **narrow down the range**. Use available information—the data's value, whether it changed, how it changed, and its likely range—to find the effective address.

For instance, in the unknown value section, the tutorial text mentions the value is between 0-500. We could have set a value range to exclude the three large values starting with 429.

You might notice that CE allows you to save the **Cheat Table**. You might think that saving it allows you to change health every time you open the program. Unfortunately, it doesn't work that way by default, but it is technically possible. To achieve this, we need to understand **Pointers**.

# Pointers

## What is a Pointer?

As mentioned earlier, all data in memory is stored as numbers. A pointer, as data, is **also just a number**. What matters is the meaning of that number: a **memory address**. A pointer is data that stores a memory address.

If you've studied C, you know that the address-of operator `&` gets a variable's address, and the dereference operator `*` gets the data at the address the pointer points to. The following code illustrates this:

```c
int a; // Define integer a, assume address is 0x0
int *b; // Define pointer b, assume address is 0x4
int **c; // Define pointer-to-pointer c, assume address is 0x8

a = 1337;
b = &a; // b now contains 0x0
c = &b; // c now contains 0x4

printf("%d %d %d", a, *b, **c); // All print 1337
/*
    a: Passed directly.
    *b: Takes address 0x0 from 0x4, then reads content of 0x0 (a).
    **c: Takes address 0x4 from 0x8, then 0x0 from 0x4, then reads content of 0x0 (a).
*/
```

Think of a pointer as a path; it's simply a set of numbers representing a location.

## Multi-level Pointers in Programs

First, understand **Base Address** and **Offset**.

- **Base Address:** The initial address allocated when a program runs, assigned by the OS. It is usually the location of the first byte of the program in memory.
- **Offset:** The distance between the data we want and a known address. If a base address is `0x4000` and our data is at `0x4020`, the offset is `0x20`.

Consider this C++ code defining Player, Inventory, and Weapon structures:

```c
struct weapon {
    int magSize = 100;
    int maxAmmo = 24;
};

struct Inventory {
    int item[4];
    weapon* weapon; // Offset: 0x10 (16 bytes)
    /*
        In 32-bit Windows, an int is 4 Bytes. 
        An array of 4 ints is 16 Bytes (0x10). 
        Therefore, the weapon pointer is at offset 0x10.
    */
};

struct Player {
    int health = 100;
    int mana = 100;
    Inventory* Inventory; // Offset: 0x8
};

Player* player;

int main() {
    player = new Player; 
    player->Inventory = new Inventory; 
    player->Inventory->weapon = new weapon; 
}
```

*Note: Each `new` operator **allocates memory randomly**, so we must use pointers to find the addresses.*

In the `main` function, the path to `weapon` is: `player` -> `Inventory` -> `weapon`. Because allocations are dynamic, we must find the corresponding **Base Address** and **Offsets** to find the memory address from outside the program.

### Example:

Assume the Base Address is `0x4000` and the `player` pointer offset is `0x1000`.

1. Find Base Address: `0x4000`.
2. `0x4000 + 0x1000 = 0x5000`. Address `0x5000` holds `0x7100` (Player's address).
3. `0x7100 + 0x8 = 0x7108`. Address `0x7108` holds `0x6020` (Inventory's address).
4. `0x6020 + 0x10 = 0x6030`. Address `0x6030` holds `0x8132` (Weapon's address).
5. `0x8132 + 0x4 = 0x8136`. This is the address for `maxAmmo`.

## Conclusion

Multi-level pointers are widely used. Once you have the base address and offsets, you can modify values at any time. In CE, you can manually add these pointers.

In the next section, we will cover how to find these offsets to quickly and accurately modify values.


![](<./assets/image (28) (1).png>)
