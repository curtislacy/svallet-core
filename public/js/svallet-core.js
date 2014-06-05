/****
 *   A "Single Address Svallet" - all the data querying and such for a single address.
 ****/
function SingleAddressSvallet() {
	var AddressData = Backbone.Model.extend( {
		// address: the bitcoin address we're viewing.
	});
	var BalanceData = Backbone.Model.extend( {
		// Map currency ID to balance.
		// Map "currencyID-source" to source of the data.
	});
	var ValueData = Backbone.Model.extend( {
		// Map currencyID to value.
		// Map "currencyID-source" to source of the data.
	});
	var CoinData = Backbone.Model.extend( {
		/* Map currencyID to coin description data:
		{
			"name": "Mastercoin",
			"description": "SAFE Network Crowdsale (MSAFE)",
			"divisible": true
		}
		
		Map "currencyID-source" to source of the data. */
	});
	var CoinIcons = Backbone.Model.extend( {
		/* Map currencyID to a favicon provided by the currency issuer. */
	});
	var NetworkStatus = Backbone.Model.extend( {
		/* Map request ID (test.omniwallet.org:balance, etc.) 
			to one of 'OK', 'In Progress', or FAILED */
	});

	this.svalletData = {
		"addressData": new AddressData(),
		"balances": new BalanceData(),
		"values": new ValueData(),
		"coinData": new CoinData(),
		"networkStatus": new NetworkStatus(),
		"coinIcons": new CoinIcons()
	}
	this.workers = {};

	this.requestor = new Requestor( this.svalletData.networkStatus );
	this.facilitator = new ConsensusFacilitator();

	this.workers[ 'balanceQuery' ] = new BalanceQueryWorker( this );
	this.workers[ 'valueQuery' ] = new ValueQueryWorker( this );
	this.workers[ 'coinDataQuery' ] = new CoinDataQueryWorker( this );

	var self = this;
	this.svalletData.coinData.on( 'change', function( data ) {
		for( var v in data.changed )
			if( data.changed.hasOwnProperty( v ))
			{
				if( v.indexOf( '-source' ) != v.length -7 )
				{
					if( data.changed[ v ].url )
						self.locateIcon( v, data.changed[ v ].url );
				}
			}
	});
}
SingleAddressSvallet.prototype.locateIcon = function( currency, url )
{
	var host = url.match( /https?:\/\/([a-zA-Z.]+)/ )[1];
	var self = this;
	this.requestor.getJSON( 
		host + ':icon',
		'/svallet/findfavicon', { 'url': url }, 
		function( response ) {
			if( response.valid )
			{
				var toSet = {};
				toSet[ currency ] = response.url;
				self.svalletData.coinIcons.set( toSet );
			}
			else
				console.error( 'No favicon available for ' + url, response );
		}, function( error ){} );
}

/****
 * The requestor - this gets data from a remote source.
 ****/
function Requestor( data ){
	this.data = data;
}
Requestor.prototype.getJSON = function( id, url, query, success, failure ) {
	if( typeof query == 'function' )
	{
		failure = success;
		success = query;
		query = null;
	}

	var self = this;
	var status = {};
	status[ id ] = 'In Progress';
	this.data.set( status );

	$.ajax( {
		"url": url,
		"dataType": 'json',
		"data": query,
		timeout: 15000
	}).done( function( response ) {
			status[ id ] = 'OK';
			self.data.set( status );
			success( response );
		})
		.error( function() {
			status[ id ] = 'FAILED';
			self.data.set( status );
			failure();
		});
}
Requestor.prototype.post = function( id, url, data, success, failure ) {
	var self = this;
	var status = {};
	status[ id ] = 'In Progress';
	this.data.set( status );

	$.post( url, data, function( response )  {
		status[ id ] = 'OK';
		self.data.set( status );
		success( response );
	}).fail( function() {
		status[ id ] = 'FAILED';
		self.data.set( status );
		failure();
	});
}

/******
 *   The consensus facilitator - manages getting values from multiple sources, and picking the best one.
 ******/
function ConsensusFacilitator() {
	this.values = {};
}
// Not a real median, this picks the lower of the two middle values if the array is even in length
ConsensusFacilitator.prototype.getPseudoMedian = function( values ) {
    values.sort( function(a,b) {return a - b;} );

    var half = Math.floor(values.length/2);

    return values[half];	
}
ConsensusFacilitator.prototype.nominateValue = function( valueKey, setter, source, value ) {
	if( !this.values.hasOwnProperty( valueKey ) ){
		this.values[ valueKey ] = {};
	}
	this.values[ valueKey ][ source ] = value;

	var firstValue = null;
	var allEqual = true;
	var allValues = [];
	var valueLookup = {};

	for( var k in this.values[ valueKey ])
		if( this.values[ valueKey ].hasOwnProperty( k ))
		{
			var candidateValue = this.values[ valueKey ][ k ];

			if( firstValue == null )
				firstValue = candidateValue;
			else
				if( firstValue != candidateValue )
					allEqual = false;

			allValues.push( candidateValue );
			valueLookup[ candidateValue ] = k;
		}
	if( allEqual )
	{
		setter( valueKey, source, value );
	}
	else
	{
		var median = this.getPseudoMedian( allValues );
		setter( valueKey, valueLookup[ median ], median );
	}
}

/****
 * BalanceQuery Worker: Actually recovers balances asynchronously.
 ****/
function BalanceQueryWorker( svallet ) {
	this.requestor = svallet.requestor;
	this.facilitator = svallet.facilitator;
	var data = svallet.svalletData;

	var self = this;
	this.addressModel = data.addressData;
	this.balances = data.balances;
	this.addressModel.on( 'change:address', function( data ) {
		self.setAddress( data.changed.address );
	} );

	this.balanceSetter = ( function( valueKey, source, value ) {
		var dataToSet = {};
		var key = valueKey.substring( 8 );
		dataToSet[ key ] = value;
		dataToSet[ key + '-source' ] = source;
		this.balances.set( dataToSet );
	} ).bind( this );
}
BalanceQueryWorker.prototype.setAddress = function( newAddress ) {
	if( this.loop )
		clearTimeout( this.loop );
	this.loop = setTimeout( this.getBalances.bind( this ) );
}
BalanceQueryWorker.prototype.getBalances = function() {
	var self = this;
	var originalAddress = this.addressModel.get( 'address' );

	var queriesComplete = 0;
	var queriesMade = 0;

	queriesMade++;
	self.requestor.getJSON( 
		'blockr:balances',
		'https://btc.blockr.io/api/v1/address/info/' + originalAddress,
		function( response ) {
			queriesComplete++;
			if( originalAddress == self.addressModel.get( 'address' ))
			{
				if( response.code == 200 )
				{
					self.facilitator.nominateValue( 
						'balance-bitcoin', self.balanceSetter, 
						'https://btc.blockr.io',
						response.data.balance );
				}
				if( queriesComplete == queriesMade )
					self.loop = setTimeout( self.getBalances.bind( self ), 30000 );
			}
		},
		function() {
			queriesComplete++;
			if( originalAddress == self.addressModel.get( 'address' ))
			{
				if( queriesComplete == queriesMade )
					self.loop = setTimeout( self.getBalances.bind( self ), 30000 );			
			}
		});

	queriesMade++;
	self.requestor.getJSON( 
		'insight.is:balances',
		'http://live.insight.is/api/addr/' + originalAddress,
		function( response ) {
			queriesComplete++;
			if( originalAddress == self.addressModel.get( 'address' ))
			{
				if( response.balance )
				{
					self.facilitator.nominateValue(
						'balance-bitcoin', self.balanceSetter,
						'http://live.insight.is/',
						response.balance );
				}
				if( queriesComplete == queriesMade )
					self.loop = setTimeout( self.getBalances.bind( self ), 30000 );
			}
		},
		function() {
			queriesComplete++;
			if( originalAddress == self.addressModel.get( 'address' ))
			{
				if( queriesComplete == queriesMade )
					self.loop = setTimeout( self.getBalances.bind( self ), 30000 );			
			}
		});

	queriesMade++;
	self.requestor.getJSON( 
		'Masterchain:balances',
		'/svallet/proxy',
		{
			'service': 'masterchain',
			'address': originalAddress
		},
		function( response ) {
			queriesComplete++;
			if( originalAddress == self.addressModel.get( 'address' ))
			{
				if( response.valid )
				{
					try {
						var data = JSON.parse( response.data );
						for( var i=0; i<data.balance.length; i++ )
						{
							var item = data.balance[i];
							if( item.symbol == 'BTC' )
							{
								self.facilitator.nominateValue( 
									'balance-bitcoin', self.balanceSetter,
									'https://masterchest.info/',
									parseFloat( item.value ));
							}
							else
							{
								self.facilitator.nominateValue( 
									'balance-' + item.symbol, self.balanceSetter,
									'https://masterchest.info/',
									parseFloat( item.value ));
							}
						}

					} catch( e ) {
						console.error( e );
					}
				}
				if( queriesComplete == queriesMade )
					self.loop = setTimeout( self.getBalances.bind( self ), 30000 );

			}
		},
		function() {
			queriesComplete++;
			if( originalAddress == self.addressModel.get( 'address' ))
			{
				if( queriesComplete == queriesMade )
					self.loop = setTimeout( self.getBalances.bind( self ), 30000 );
			}
		});

	queriesMade++;
	self.requestor.post( 
		'Omni Test:balances',
		'https://test.omniwallet.org/v1/address/addr/',
		{ addr: originalAddress },
		function( response ) {
			queriesComplete++;
			if( originalAddress == self.addressModel.get( 'address' ))
			{
				if( response.balance )
				{
					for( var v in response.balance )
					{
						var item = response.balance[v];
						if( item.symbol == 'BTC' )
						{
							self.facilitator.nominateValue( 
								'balance-bitcoin', self.balanceSetter,
								'https://test.omniwallet.org/',
								item.value / 100000000 );
						}
						else if( item.symbol == 'MSC' || item.symbol == 'TMSC' )
						{
							self.facilitator.nominateValue( 
								'balance-' + item.symbol, self.balanceSetter,
								'https://test.omniwallet.org/',
								item.value / 100000000 );
						}
						else
						{
							self.facilitator.nominateValue( 
								'balance-MSC-' + item.symbol, self.balanceSetter,
								'https://test.omniwallet.org/',
								item.value );
						}
					}
				}
				
				if( queriesComplete == queriesMade )
					self.loop = setTimeout( self.getBalances.bind( self ), 30000 );

			}
		},
		function() {
			queriesComplete++;
				if( queriesComplete == queriesMade )
					self.loop = setTimeout( self.getBalances.bind( self ), 30000 );			
		});

	queriesMade++;
	self.requestor.getJSON( 
		'blockscan:balances',
		'/svallet/proxy',
		{
			'service': 'blockscan-balances',
			'address': originalAddress
		},
		function( response ) {
			queriesComplete++;
			if( originalAddress == self.addressModel.get( 'address' ))
			{
				if( response.valid )
				{
					try {
						var data = JSON.parse( response.data );
						for( var i=0; i<data.data.length; i++ )
						{
							var item = data.data[i];
							var symbol = ( item.asset == 'XCP' ) ?
											item.asset : 'XCP-' + item.asset;

							self.facilitator.nominateValue( 
								'balance-' + symbol, self.balanceSetter,
								'http://blockscan.com//',
								parseFloat( item.balance ));
						}

					} catch( e ) {
						console.error( e );
					}
				}
				if( queriesComplete == queriesMade )
					self.loop = setTimeout( self.getBalances.bind( self ), 30000 );

			}
		},
		function() {
			queriesComplete++;
				if( queriesComplete == queriesMade )
					self.loop = setTimeout( self.getBalances.bind( self ), 30000 );			
		});

	queriesMade++;
	self.requestor.getJSON( 
		'Masterchest:balances',
		'/svallet/proxy',
		{
			'service': 'masterchest',
			'address': originalAddress
		},
		function( response ) {
			queriesComplete++;
			if( originalAddress == self.addressModel.get( 'address' ))
			{
				if( response.valid )
				{
					try {
						var data = JSON.parse( response.data );

						for( var i=0; i<data.balance.length; i++ )
						{
							var item = data.balance[i];
							var symbol = ( item.symbol == 'MSC' || item.symbol == 'TMSC' ) ?
										item.symbol : 'MSC-' + item.symbol;

							self.facilitator.nominateValue( 
								'balance-' + symbol, self.balanceSetter,
								'https://masterchest.info/',
								item.value );
						}

					} catch( e ) {
						console.error( {
							'error': e,
							'response': response 
						} );
					}
				}
				if( queriesComplete == queriesMade )
					self.loop = setTimeout( self.getBalances.bind( self ), 30000 );

			}
		},
		function() {
			queriesComplete++;
				if( queriesComplete == queriesMade )
					self.loop = setTimeout( self.getBalances.bind( self ), 30000 );			
		});

	
	// blockchain.info doesn't return Access-Control-Allow-Origin, so we can't get to it.
	// We may be able to form things properly such that CORS works, see: https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS
/*	self.requestor.getJSON( 'https://blockchain.info/address/' + originalAddress + '?format=json&cors=true',
		function( response ) {
			if( originalAddress == self.addressModel.get( 'address '))
			{
				if( response.code == 200 )
				{
					console.log( 'Blockchain.info response' );
					console.log( response.data );
				}
			}
	});*/

	
}

/******
 *    ValueQueryWorker: Recovers values of currencies.
 ******/
function ValueQueryWorker( svallet ) {
	this.requestor = svallet.requestor;
	this.facilitator = svallet.facilitator;
	var data = svallet.svalletData;
	
	var self = this;
	this.balances = data.balances;
	this.values = data.values;
	this.loops = {};
	this.balances.on( 'change', function( data ) {
		for( var v in data.changed )
		{
			if( data.changed.hasOwnProperty( v ))
			{
				if( v.indexOf( '-source' ) != v.length - 7 )
					if( !self.loops[ v ])
						self.addCurrency( v );
			}
		}
	});
	this.valueSetter = ( function( valueKey, source, value ) {
		var dataToSet = {};
		var key = valueKey.substring( 6 );
		dataToSet[ key ] = value;
		dataToSet[ key + '-source' ] = source;
		this.values.set( dataToSet );
	} ).bind( this );
}
ValueQueryWorker.prototype.addCurrency = function( currency ) {
	this.loops[ currency ] = setTimeout( this.getValues.bind( {
		self: this,
		currency: currency
	} ));
}
ValueQueryWorker.prototype.getValues = function() {
	var outerThis = this;
	var self = this.self;
	var currency = this.currency;
	if( this.currency == 'bitcoin' )
	{

		var requestsMade = 0;
		var requestsDone = 0;
		var results = [];


		// This call actually tends to time out - an ideal situation for having multiple sources!
		requestsMade++;
		self.requestor.getJSON( 
			'blockr:value-btc',
			'http://btc.blockr.io/api/v1/exchangerate/current',
			function( response ) {
				requestsDone++;
				if( response.code == 200 )
				{
					var usdToBtc = parseFloat( response.data[0].rates.BTC );
					self.facilitator.nominateValue( 
						'value-bitcoin', self.valueSetter,
						'http://blockr.io', 1.0 / usdToBtc );
				}
				if( requestsMade == requestsDone )
				{
					self.loops[ currency ] = setTimeout( self.getValues.bind( outerThis ), 30000 );
				}
			},
			function() {
				requestsDone++;
				if( requestsMade == requestsDone )
				{
					self.loops[ currency ] = setTimeout( self.getValues.bind( outerThis ), 30000 );
				}
			}
		);

		requestsMade++;
		self.requestor.getJSON( 
			'BitcoinAverage:value-btc',
			'https://api.bitcoinaverage.com/exchanges/USD',
			function( response ) {
				requestsDone++;
				if( response )
				{
					var sum = 0;
					var count = 0;
					for( var k in response )
					{
						if( response.hasOwnProperty( k ) && response[ k ].rates )
						{
							self.facilitator.nominateValue( 
								'value-bitcoin', self.valueSetter,
								response[k].display_URL,
								response[ k ].rates.last );
						}
					}
				}
				if( requestsMade == requestsDone )
				{
					self.loops[ currency ] = setTimeout( self.getValues.bind( outerThis ), 30000 );
				}
			},
			function() {
				requestsDone++;
				if( requestsMade == requestsDone )
				{
					self.loops[ currency ] = setTimeout( self.getValues.bind( outerThis ), 30000 );
				}
			}
		);
	}
	else if( this.currency == 'MSC' )
	{
		self.requestor.getJSON( 
			'MasterXchange:value-msc',
			'https://masterxchange.com/api/v2/trades.php?currency=msc',
			function( response ) {
				var totalCoins = 0;
				var totalValue = 0;
				for( var i = 0; i<response.length; i++ )
				{
					if( response[i].market == 'msc_btc' )
					{
						totalCoins += parseFloat( response[i].amount );
						totalValue += parseFloat( response[i].amount * response[i].price );
					}
				}
				var averageValue = totalValue / totalCoins;
				if( self.values.get( 'bitcoin' ))
				{
					var mscToUsd = averageValue * self.values.get( 'bitcoin' );
					self.values.set( {
						'MSC': mscToUsd,
						'MSC-source': 'https://masterxchange.com/'
					});
				}
				self.loops[ currency ] = setTimeout( self.getValues.bind( outerThis ), 30000 );
			},
			function() {
				self.loops[ currency ] = setTimeout( self.getValues.bind( outerThis ), 30000 );
			}
		);
	}
	else if( this.currency == 'XCP' )
	{
		self.requestor.getJSON( 
			'poloniex:value-xcp',
			'/svallet/proxy',
			{
					'service': 'poloniex-value',
					'currency': 'XCP'
				},
			function( response ) {
				if( response.valid )
				{
					var data = JSON.parse( response.data );
					var totalAmount = 0;
					var totalCost = 0;
					for( var i=0; i<data.length; i++ )
					{
						totalAmount += parseFloat( data[i].amount );
						totalCost += parseFloat( data[i].total );
					}
					var tokenToBtc = ( totalCost / totalAmount );
					if( self.values.get( 'bitcoin' ))
					{
						var tokenToUsd = tokenToBtc * self.values.get( 'bitcoin' );
						var valuesToSet = {
							'XCP': tokenToUsd,
							'XCP-source': 'https://poloniex.com/'
						};
						self.values.set( valuesToSet );
					}
				}
				self.loops[ currency ] = setTimeout( self.getValues.bind( outerThis ), 30000 );
			},
			function() {
				self.loops[ currency ] = setTimeout( self.getValues.bind( outerThis ), 30000 );
			});
	}
	else if( this.currency == 'MSC-SP3' )
	{
		self.requestor.getJSON( 
			'MasterXchange:value-msc-sp3',
			'https://masterxchange.com/api/v2/trades.php?currency=maid',
			function( response ) {
				var totalCoins = 0;
				var totalValue = 0;
				for( var i = 0; i<response.length; i++ )
				{
					if( response[i].market == 'maid_btc' )
					{
						totalCoins += parseFloat( response[i].amount );
						totalValue += parseFloat( response[i].amount * response[i].price );
					}
				}
				if( totalCoins > 0 )
				{
					var averageValue = totalValue / totalCoins;
					if( self.values.get( 'bitcoin' ))
					{
						var maidToUsd = averageValue * self.values.get( 'bitcoin' );
						self.values.set( {
							'MSC-SP3': maidToUsd,
							'MSC-SP3-source': 'https://masterxchange.com/'
						});
					}					
				}
				else
				{
					self.values.unset( 'MSC-SP3' );
				}
				self.loops[ currency ] = setTimeout( self.getValues.bind( outerThis ), 30000 );
			},
			function() {
				self.loops[ currency ] = setTimeout( self.getValues.bind( outerThis ), 30000 );
			}
		);
	}
	else
	{
		var currency = this.currency;
		var poloniexDtt = this.currency.match( /^XCP-([A-Za-z0-9]+)DTT$/ );
		if( poloniexDtt )
		{
			self.requestor.getJSON( 
				'poloniex:value-' + poloniexDtt[1],
				'/svallet/proxy',
				{
					'service': 'poloniex-value',
					'currency': poloniexDtt[1]
				},
				function( response ) {
					if( response.valid )
					{
						var data = JSON.parse( response.data );
						var totalAmount = 0;
						var totalCost = 0;
						for( var i=0; i<data.length; i++ )
						{
							totalAmount += parseFloat( data[i].amount );
							totalCost += parseFloat( data[i].total );
						}
						var tokenToBtc = ( totalCost / totalAmount );
						if( self.values.get( 'bitcoin' ))
						{
							var tokenToUsd = tokenToBtc * self.values.get( 'bitcoin' );
							var valuesToSet = {};
							valuesToSet[ currency ] = tokenToUsd;
							valuesToSet[ currency + '-source' ] = 'https://poloniex.com/';
							self.values.set( valuesToSet );
						}
					}
					self.loops[ currency ] = setTimeout( self.getValues.bind( outerThis ), 30000 );
				},
				function() {
					self.loops[ currency ] = setTimeout( self.getValues.bind( outerThis ), 30000 );
				});
		}
	}
}


/****
 * Coin Data Query Worker:  Recovers coinDatas of currencies.
 ****/
function CoinDataQueryWorker( svallet ) {
	this.requestor = svallet.requestor;
	var data = svallet.svalletData;
	
	var self = this;
	this.balances = data.balances;
	this.coinData = data.coinData;
	this.loops = {};
	this.balances.on( 'change', function( data ) {
		for( var v in data.changed )
		{
			if( data.changed.hasOwnProperty( v ))
			{
				if( v.indexOf( '-source' ) != v.length - 7 )
					if( !self.loops[ v ])
						self.addCurrency( v );
			}
		}
	});
}
CoinDataQueryWorker.prototype.addCurrency = function( currency ) {
	this.loops[ currency ] = setTimeout( this.getCoinData.bind( {
		self: this,
		currency: currency
	} ));
}
CoinDataQueryWorker.prototype.getCoinData = function() {
	var outerThis = this;
	var self = this.self;
	var currency = this.currency;

	if( currency == 'bitcoin' )
	{
		self.requestor.getJSON( 
			'blockr:info-bitcoin',
			'http://btc.blockr.io/api/v1/coin/info',
			function( response ) {
				if( response.code == 200 )
				{
					self.coinData.set( {
						"bitcoin": {
							"name": response.data.coin.name,
							"url": "https://bitcoin.org"
						}
					});
				}
/*				if( response[0] )
				{
					var extractedData = {};
					extractedData[ currency + '-source' ] = 'https://test.omniwallet.org/';
					extractedData[ currency ] = {
						"name": response[0].propertyName + ' (' + match[1] + ')',
						"description": response[0].propertyData,
						"divisible": parseInt( response[0].property_type ) == 2
					}
					self.coinData.set( extractedData );
				}*/
				self.loops[ currency ] = setTimeout( self.getCoinData.bind( outerThis ), 30000 );
			},
			function() {
				self.loops[ currency ] = setTimeout( self.getCoinData.bind( outerThis ), 30000 );
			}
		);
	}
	else if( currency == 'MSC' )
	{
		self.coinData.set( {
			"MSC": {
				"name": 'Mastercoin',
				"url": "http://www.mastercoin.org"
			}
		});
	}
	else if( currency == 'XCP' )
	{
		self.coinData.set( {
			"XCP": {
				"name": 'Counterparty',
				"url": 'https://www.counterparty.co/'
			}
		});
	}
	else
	{
		var match = currency.match( /^MSC-SP([0-9]+)$/ )
		if( match )
		{
			self.requestor.getJSON( 
				'Omni Test:info-' + currency,
				'https://test.omniwallet.org/v1/property/' + match[1] + '.json',
				function( response ) {
					if( response[0] )
					{
						var extractedData = {};
						extractedData[ currency + '-source' ] = 'https://test.omniwallet.org/';
						extractedData[ currency ] = {
							"name": response[0].propertyName + ' (#' + match[1] + ')',
							"description": response[0].propertyData,
							"divisible": parseInt( response[0].property_type ) == 2
						}
						var url = response[0].propertyUrl;
						if( url )
						{
							url = url.toLowerCase().replace(/ +/g,'_').replace(/[0-9]/g,'').replace(/[^a-z0-9-_.]/g,'').trim();
							if( !url.match( /^[a-z]+:\/\// ))
								url = 'http://' + url;
							extractedData[ currency ].url = url;
						}
						self.coinData.set( extractedData );
					}
					self.loops[ currency ] = setTimeout( self.getCoinData.bind( outerThis ), 30000 );
				},
				function( response ) {
					self.loops[ currency ] = setTimeout( self.getCoinData.bind( outerThis ), 30000 );
				}
			);
		}
		else
		{
			match = currency.match( /^XCP-([A-Za-z0-9]+)$/ )
			if( match )
			{
				var dataToSet = {};
				dataToSet[ currency ] = {
					"name": match[ 1 ]
				};
				self.coinData.set( dataToSet );
			}
		}		
	}

}

