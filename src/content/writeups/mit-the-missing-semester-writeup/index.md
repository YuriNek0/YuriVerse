---
title: MIT - The missing semester writeup
pubDate: 2023-11-24
---

## About

I have been taking the missing semester recently, and this is my writeup for the exercises that I think is useful.

## Data Wrangling

1.  Find the number of words (in `/usr/share/dict/words`) that contain at least three `a`s and don’t have a `'s` ending.&#x20;



    For this question, all we need is to use cat to obtain the data. Then delete all words with an 's' ending. Finally use awk to display all words with three 'a's. Counting the number with `wc -l` but here I won't pipe the command as further use of data is required.



    `cat /usr/share/dict/words | sed -E '/^.*s$/d' | awk -Fa '{if (NF-1>=3) {print $0}}'`

*   What are the three most common last two letters of those words?&#x20;



    Note that when using `uniq` command the data should be sorted first. Another way to solve this is to use `sort -u`



    `cat /usr/share/dict/words | sed -E '/^.*s$/d' | awk -Fa '{if (NF-1>=3){ print substr($0,length($0)-1)}}' | sort | uniq -c | sort | tail -n 3`


*   How many of those two-letter combinations are there?&#x20;



    `cat /usr/share/dict/words | sed -E '/^.*s$/d' | awk -Fa '{if (NF-1>=3){ print substr($0,length($0)-1)}}' | sort | uniq -c | wc -l`


*   Which combinations do not occur?



    First, we need a wordlist contain all combinations, which can be generated using `echo {a..z}{a..z}` . Then use tr to replace space into newline and use cat to concat the stream. Finally, we find the total unique count of the combinations. The value of 1 is what we wanted, as the combinations we found should have a total count of 2. Because when we add the wordlist in the stream, every combination should start with a total count of one.



    `cat /usr/share/dict/words | sed -E '/^.*s$/d' | awk -Fa '{if (NF-1>=3){ print substr($0,length($0)-1)}}' | sort | uniq | cat <(echo {a..z}{a..z} | tr ' ' '\n') - | sort | uniq -c | awk '$1=="1" {print $2}'`

2\. To do in-place substitution it is quite tempting to do something like `sed s/REGEX/SUBSTITUTION/ input.txt > input.txt`. However this is a bad idea, why? Is this particular to `sed`? Use `man sed` to find out how to accomplish this.

* When we use `>` operator to redirect the STDOUT, the target file has been truncated by your shell, which means the sed program can only read an empty file and write nothing, causing the input.txt lost.
* Use -i option to achieve the goal.

3\. Find your average, median, and max system boot time over the last ten boots. Use `journalctl` on Linux and `log show` on macOS, and look for log timestamps near the beginning and end of each boot.

* `journalctl | grep "Startup finished in" | head -n5 | sed -E 's/^.*= (.*)s\./\1/g' | R --slave -e 'x <- scan(file="stdin", quiet=TRUE); summary(x)'`\


## Command-line Environment

1.  From what we have seen, we can use some `ps aux | grep` commands to get our jobs’ pids and then kill them, but there are better ways to do it. Start a `sleep 10000` job in a terminal, background it with `Ctrl-Z` and continue its execution with `bg`. Now use [`pgrep`](https://www.man7.org/linux/man-pages/man1/pgrep.1.html) to find its pid and [`pkill`](http://man7.org/linux/man-pages/man1/pgrep.1.html) to kill it without ever typing the pid itself. (Hint: use the `-af` flags).



    `pkill -af "sleep 10000"`
2.  Say you don’t want to start a process until another completes. How would you go about it? In this exercise, our limiting process will always be `sleep 60 &`. One way to achieve this is to use the [`wait`](https://www.man7.org/linux/man-pages/man1/wait.1p.html) command. Try launching the sleep command and having an `ls` wait until the background process finishes.



    <figure>

![](<./assets/image (2) (2).png>)

<figcaption></figcaption></figure>

    However, this strategy will fail if we start in a different bash session, since `wait` only works for child processes. One feature we did not discuss in the notes is that the `kill` command’s exit status will be zero on success and nonzero otherwise. `kill -0` does not send a signal but will give a nonzero exit status if the process does not exist. Write a bash function called `pidwait` that takes a pid and waits until the given process completes. You should use `sleep` to avoid wasting CPU unnecessarily.



    ```bash
    function pidwait(){	
    	if [[ "$1" -eq "" ]]; then 
    		echo "Usage: pidwait pid" 
    		return 
    	fi
    	true;
    	while [[ $? == 0 ]]; do
    		sleep 0.5;
    		kill -0 $1 > /dev/null 2>&1;
    	done;
    	
    	echo "Process $1 exited."
    }
    ```

## Version Control (Git)

1.  Who was the last person to modify `README.md`? (Hint: use `git log` with an argument).

    `git log README.md | grep "Author" | sed -E 's/Author: (.) <.@.*>/\1/' | head -n1`
2.  What was the commit message associated with the last modification to the `collections:` line of `_config.yml`? (Hint: use `git blame` and `git show`).

    `git blame _config.yml | grep collections | head -c8 | xargs git show --format=%B | head -n1`

