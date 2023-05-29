# Perp Algo Executor

A simple algo executor for perpetual protocol v2. Please note that it uses simple strategies and serves as a template for developers to create their own strategy. Use it at your own risk!
To add your own strategy, simply implement the Execution interface in src/strategies/execution/interface.ts and add the execution validity checks as necessary.

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
$ git clone https://github.com/grantweii/perp-algo-executor.git
$ cd perp-algo-executor
$ yarn install
```

## Configuration

Edit the trading parameters in `src/config.json`:

```javascript
{
    "AAVE": {
        "HEDGE": {
            "ENABLED": true,
            "EXCHANGE": "binance",
            "QUOTE_TOKEN": "USDT"
        },
        "EXECUTION": {
            "STRATEGY": "spread",
            "MIN_SPREAD": -5, // basis points
            "ORDER_NOTIONAL": 2500 // dollars
        },
        "TOTAL_NOTIONAL": 20000, // dollars
        "PERP_DIRECTION": "long",
        "SLIPPAGE": 10, // optional (bps), default 50
        /**
         * Buffer that is acceptable in calculations.
         *  - used in determining strategy completion ie. notional between $980 and $1020 will be considered complete when OPENING
         *  - used in determining position validity ie. $20 difference between hedge notional and perp notional is still considered valid
         * optional (dollars), default 5
         */
        "ACCEPTABLE_DIFFERENCE": 20
    },
    "ETH": {
        "HEDGE": {
            "ENABLED": false,
            "EXCHANGE": "binance",
            "QUOTE_TOKEN": "USDT"
        },
        "EXECUTION": {
            "STRATEGY": "twap",
            "PARTS": 10,
            "PERIOD": "1h", // eg. "5m" (minutes), "2h" (hours), "1d" (days)
        },
        "TOTAL_NOTIONAL": 100000, // dollars
        "PERP_DIRECTION": "short",
        "POLL_INTERVAL": 5000, // optional (ms), default 2000
        "HIDE_SIZE": true, // optional, default false
        "CLOSE_ONLY": true // optional, default false
    }
}
```

## Environment Variables

Provide your endpoint(s) and API keys in `.env`:

```bash
# secrets
PRIVATE_KEY={WALLET_PRIVATE_KEY}
BINANCE_API_KEY={BINANCE_API_KEY}
BINANCE_API_SECRET={BINANCE_API_SECRET}

# optional
OPTIMISM_HTTP_RPC_URL={PRIVATE_HTTP_RPC}
OPTIMISM_WS_RPC_URL={PRIVATE_WS_RPC}
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