# gifiddle

gifiddle is a GIF viewer based on JavaScript and HTML5 that runs entirely in a browser.

Now, you may think *"Who the hell would need that? GIFs are supported by browsers since the invention of the WWW!"*.

That's correct. But wait, there's more!

* A video player interface for frame-precise playback control.
* Detailed information and various rendering modes for analysis and optimization.
* Correct delay handling for non-looping GIF animations.
* Full support of all GIF89a features, including the long-forgotten plain text extension and the "wait for user input" flag, which allows some historical GIFs to be viewed correctly.

### Compatibility

Most modern browsers in their recent versions (as of 2015) should work. I tested gifiddle with Firefox 36, Chrome 41 and, with a few quirks, Internet Explorer 10. The app makes extensive use of HTML5 and JavaScript features, so don't expect it to run in old browsers.

Also note that gifiddle requires quite a lot of RAM for large GIFs, since every frame needs to be decoded and kept in memory.

### Credits

The GIF reading code is mostly based on [shachaf's](https://github.com/shachaf) [jsgif](https://github.com/shachaf/jsgif), modified with a fast LZW implementation from [deanm's](https://github.com/deanm) [omggif](https://github.com/deanm/omggif) and a few extensions on my side.