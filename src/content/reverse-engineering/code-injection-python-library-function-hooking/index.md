---
title: Code Injection - Python library function hooking
pubDate: 2023-08-27
---

Today I have a simple task to do, which is download some videos on a website.

The video is in m3u8 format, but it is not a standard m3u8 file. The decryption key and URL is not correct for videos to download or decrypt.

After some reversing of the front-end including debugging with WebAssembly, I figured out the logic of this website.

But what next? Since it is not a standard m3u8, we cannot merge it using FFMpeg. Now a python library come to same us. That is m3u8downloader!

After digging down to its [source code](https://files.pythonhosted.org/packages/ce/a3/2ec2eee9be0edf256fdbe8d2aafb2b53eeca4daf9be160db842e2ba68186/m3u8downloader-0.10.1.tar.gz) I found out in main.py, the `get_url_content`function can be modified to replace the path. It returns a bytes object to the caller, which means we can also playing with the data.

So here is what I did, firstly, I imported `m3u8downloader.main` as a module. Then I backup and modify the function reference to my own function. Just like what frida do!

```python
# HOOK
PARAM="SOME KEY FOR AUTHENTICATION"
_get_url_content = module.get_url_content
def hook(url):
    if "m3u8?" in url:
            return _get_url_content(url)
    if "app.xiaoe-tech.com" in url:
            key1 = list(_get_url_content(url+"SOME OTHER PARAMS"))
            key2 = b'SOMEKEY'
            for i in range(len(key1)):
                key1[i] ^= key2[i]
            return bytes(key1)    
    return _get_url_content(url.replace("ORIGINALURL", "REPLACEMENTURL")+PARAM)
module.get_url_content = hook
```

After that it works like a charm, however some filename conflict occured when I run this. I found that some .ts file shared the same name but with different url arguments, which has been removed after download. So I hooked another function to make md5 of the url determine the filename.

```python
def get_local_file_for_url(tempdir, url, path_line=None):
    if path_line and path_line.startswith(tempdir):
        return path_line
    return os.path.normpath(os.path.join(tempdir, hashlib.md5(url.encode()).hexdigest()))
module.get_local_file_for_url = get_local_file_for_url
```

Note that for this purpose I didn't backup the original function. Because we don't have to if we want to implement our own logic. However in most cases, when we want to write a filter, we must backup the original function to call later.

Hope you found this helpful!
