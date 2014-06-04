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