Svallet-Core
==========

Tired of jumping from site to site to figure out the state of your cryptoassets? So are we!

The svallet is an entirely new kind of wallet. Rather than maintaining all of your data itself, the svallet knows where that data is held by others, compiles it and shows it to you in a concise, easy-to-understand format. Nothing to install if you run from svallet.info, and no blockchain to sync and parse if you install it yourself from here!

This repository contains the "core" of svallet - all the stuff on the client and server sides that queries and processes data from other sources.

Like this? Help me keep it going! 1Lhx85xtTjDTXHgXPVCBnBeJotG4kU5eK3

Usage
==========
Installing the client code and server-side endpoints is very simple.  

1. Include ``svallet-core`` in your 	``package.json``.
2. Add this to your express setup:
    ```js
    var svallet_core = require( 'svallet-core' );
    
    var app = express();
    app.configure(function () {
	    // Do your configuration and such in here; you've probably already got a bunch of stuff.
    
	    // Add this at the end, so you can get the svallet client library.
	    app.use(express.static( __dirname + '/node_modules/svallet-core/public' ));
    } );
    
    svallet_core.attach( app );
    ```

3. Include the library file in any of your HTML files:
    ```html
        <script src="/js/svallet-core.js"></script>
    ```

Signing with your PGP key
==========

Signing your commits with a PGP key is always appreciated. 

1. Generate a key: http://stackoverflow.com/a/16725717/364485 
2. Sign your commit: `git commit -S` (Works for merges too, don't need to sign every commit, just the last one before you push something up. 
3. Check the signature on your commit: `git log --show-signature`
4. You may not have all the contributor's public keys, to verify.  Most of them will be willing to send you either their key or its hash if you contact them (and contacting them is the best way to be sure you get the right one), then you can import it into your GPG client.  For example, to get mine (https://github.com/curtislacy), `gpg --recv-key 2A79E3932902383C`