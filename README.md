# Perp Funding Rate Arbitrageur

A simple funding rate arbitrageur strategy for perpetual protocol v2. Please note that it uses naive strategies and serves as a template for developers to create their own arbitraging strategy. Use it at your own risk!

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
        "HEDGE_EXCHANGE": "ftx",
        "TOTAL_NOTIONAL": 200,
        "PERP_DIRECTION": "long",
        "MIN_SPREAD": 25,
        "ORDER_NOTIONAL": 100
    },
    "ETH": {
        "STRATEGY": "twap",
        "HEDGE_EXCHANGE": "ftx",
        "TOTAL_NOTIONAL": 200,
        "PERP_DIRECTION": "short",
        "PARTS": 2,
        "PERIOD": "5m",
        "CLOSE_ONLY": true,
        "POLL_INTERVAL": 5000, // optional
        "SLIPPAGE": 100 // optional
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
RPC_URL={PRIVATE_RPC}
```

## Run

```bash
$ npm start
```

---

> If any features/functionalities described in the Perpetual Protocol documentation, code comments, marketing, community discussion or announcements, pre-production or testing code, or other non-production-code sources, vary or differ from the code used in production, in case of any dispute, the code used in production shall prevail. Please report any bugs to the Perpetual Protocol Team.