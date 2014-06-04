Svallet-Core
==========

Tired of jumping from site to site to figure out the state of your cryptoassets? So are we!

The svallet is an entirely new kind of wallet. Rather than maintaining all of your data itself, the svallet knows where that data is held by others, compiles it and shows it to you in a concise, easy-to-understand format. Nothing to install if you run from svallet.info, and no blockchain to sync and parse if you install it yourself from here!

This repository contains the "core" of svallet - all the stuff on the client and server sides that queries and processes data from other sources.

Like this? Help me keep it going! 1Lhx85xtTjDTXHgXPVCBnBeJotG4kU5eK3

Usage
==========
Installing the server-side endpoints is very simple.  Include ``svallet-core`` in your 	``package.json``, and then add this to your express setup:
```js
var svallet_core = require( 'svallet-core' );

var app = express();
app.configure(function () {
	// Do your configuration and such in here; you've probably already got it.
} );

svallet_core.attach( app );
```