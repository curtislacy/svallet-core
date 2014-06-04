var request = require( 'request' );
var cheerio = require( 'cheerio' );

var faviconCache = {};

module.exports.attach = function( app ) {
	/* Used to proxy requests to providers who don't 
		set Access-Control-Allow-Origin.  Note that this actually does the URL 
		production, so the client can't just make arbitrary requests to arbitrary
		sites. */
	app.get( '/svallet/proxy', function( req, res ) {
		var service = req.query.service;

		if( service == 'masterchest' )
		{
			var address = req.query.address;
			if( address.match( /^[13][A-Za-z0-9]{26,33}$/ ))
			{
				proxyGet( 'https://www.masterchest.info/mastercoin_verify/adamtest.aspx?address=' + address, res );
			}
			else
				res.json( { 'valid': false, 'error': 'Malformed Address' } );		
		}
		else if( service == 'masterchain' )
		{
			var address = req.query.address;
			if( address.match( /^[13][A-Za-z0-9]{26,33}$/ ))
			{
				proxyGet( 'https://masterchain.info/addr/' + address + '.json', res );
			}
			else
				res.json( { 'valid': false, 'error': 'Malformed Address' } );		
		}
		else if( service == 'blockscan-balances' )
		{
			var address = req.query.address;
			if( address.match( /^[13][A-Za-z0-9]{26,33}$/ ))
			{
				proxyGet( 'http://blockscan.com/api2.aspx?module=balance&address=' + address, res );
			}
			else
				res.json( { 'valid': false, 'error': 'Malformed Address' } );		
		}
		else if( service == 'poloniex-value' )
		{
			var currency = req.query.currency;
			if( currency.match( /^[A-Za-z0-9]+$/))
				proxyGet( 'https://poloniex.com/public?command=returnTradeHistory&currencyPair=BTC_' + currency, res );
			else
			{
				res.json( { 'valid': false, 'error': 'Invalid Currency.' });
			}
		}
		else
			res.json( { 'valid': false, 'error': 'Invalid Service.' } );		

	});
	function proxyGet( url, res ) {
		request.get( url,
			function( error, message, response ) {
				if( error )
				{
					res.json( { 'valid': false, 'error': error.toString() } );
				}
				else
				{
					res.send( { 'valid': true, 'data': response } );
				}
			}
		);

	}

	// Used to get around sites that don't set Access-Control-Allow-Origin.
	app.get( '/svallet/findfavicon', function( req, res ) {
		var url = req.query.url;

		var match = url.match( /(https?):\/\/\S+$/ );
		if( match )
		{
			var cachedValue = faviconCache[ url ];

			if( cachedValue && (( new Date().getTime() - cachedValue.timestamp  ) < 600000 ))
			{
				res.json( { 'valid': true, 'url': cachedValue.url });
			}
			else
			{
				request.get( url, function( error, message, response ) {
					if( error )
					{
						res.json( { 'valid': false, 'error': error.toString() });
					}
					else
					{
						try {
							var $ = cheerio.load( response );
							var found = false;
							$( 'link' ).each( function( element ) {
								if( !found && this.attribs.rel.indexOf( 'icon' ) >= 0 )
								{
									found = true;
									var iconUrl = this.attribs.href;
									if( !iconUrl.match( /(https?):\/\/\S+$/ ) )
									{
										if( iconUrl.substring( 0,1 ) == '/' )
											iconUrl = url + iconUrl;
										else
											iconUrl = url + '/' + iconUrl;
									}
									faviconCache[ url ] = {
										'url': iconUrl,
										'timestamp': new Date().getTime()
									};
									res.json( { 'valid': true, 'url': iconUrl });
								}
							});
							if( !found )
								res.json( { 'valid': false });

						} catch( e ) {
							res.json( { 'valid': false, 'error': e.toString() });
						}
					}
				});
			}
		}
		else
			res.json( { 'valid': false });
	})
};
