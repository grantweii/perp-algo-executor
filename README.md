# Perp Funding Rate Arbitrageur

A simple funding rate arbitrageur strategy for perpetual protocol v2. Please note that it uses naive strategies and serves as a template for developers to create their own arbitraging strategy. Use it at your own risk!

## How it works

1. Do your own analysis and decide which markets you would like to open positions for
2. Decide which execution strategy you want to use
3. Setup config (see example below)
4. Run and monitor trades until completed
#### Closing positions
5. Update config *CLOSE_ONLY: true* and invert *PERP_DIRECTION*

### Gotchas
- Rates are in [BPS](https://www.investopedia.com/terms/b/basispoint.asp)
- Notionals are in $
- Parameters are case sensitive

### Supported hedge exchanges
1. ~~FTX~~
2. Binance

### Supported execution strategies
1. [TWAP](https://river.com/learn/terms/t/time-weighted-average-price-twap/#:~:text=An%20asset's%20time%2Dweighted%20average,over%20a%20specified%20time%20period.)
2. Spread $(short\_price - long\_price) \over ((short\_price + long\_price) / 2) * 10000$ (The higher the more favourable price is required to execute the child order)

## Installation

```bash
$ git clone https://github.com/grantweii/perp-funding-arbitrageur.git
$ cd perp-funding-arbitrageur
$ yarn install
```

## Configuration

Edit the trading parameters in `src/config.json`:

```javascript
{
    "AAVE": {
        "STRATEGY": "spread",
        "HEDGE_EXCHANGE": "binance",
        "HEDGE_QUOTE_TOKEN": "USDT",
        "TOTAL_NOTIONAL": 200,
        "PERP_DIRECTION": "long",
        "MIN_SPREAD": 25, // in bps
        "ORDER_NOTIONAL": 100
    },
    "ETH": {
        "STRATEGY": "twap",
        "HEDGE_EXCHANGE": "binance",
        "HEDGE_QUOTE_TOKEN": "BUSD",
        "TOTAL_NOTIONAL": 200,
        "PERP_DIRECTION": "short",
        "PARTS": 2,
        // eg. "5m" (minutes), "2h" (hours), "1d" (days)
        "PERIOD": "5m",
        // optional, default false
        "CLOSE_ONLY": true,
        // optional (ms), default 2000
        "POLL_INTERVAL": 5000,
         // optional (bps), default 100
        "SLIPPAGE": 100,
        /**
         * Buffer that is acceptable in calculations.
         * eg. 50 on a total notional of $1000 means $5 buffer is acceptable.
         *  - used in determining strategy completion ie. notional between $995 and $1005 will be considered complete when OPENING
         *  - used in determining position validity ie. $5 difference between hedge notional and perp notional is still considered valid
         * optional (bps)
         */
        "ACCEPTABLE_DIFFERENCE": 50
    }
}
```

## Environment Variables

Provide your endpoint(s) and API keys in `.env`:

```bash
# secrets
PRIVATE_KEY={WALLET_PRIVATE_KEY}
FTX_API_KEY={FTX_API_KEY}
FTX_API_SECRET={FTX_API_SECRET}
FTX_SUBACCOUNT={FTX_SUBACCOUNT_NAME}

# optional
HTTP_RPC_URL={PRIVATE_HTTP_RPC}
WS_RPC_URL={PRIVATE_WS_RPC}
```

## Run

```bash
$ npm start
```

## Test

```bash
$ npm test
```

---

> If any features/functionalities described in the Perpetual Protocol documentation, code comments, marketing, community discussion or announcements, pre-production or testing code, or other non-production-code sources, vary or differ from the code used in production, in case of any dispute, the code used in production shall prevail. Please report any bugs to the Perpetual Protocol Team.