import { AlgoEngine } from '.';
import { State } from '../interface';
import { Position as PerpPosition } from '@perp/sdk-curie';
import { AlgoEngineParameters } from './interface';
import { Direction } from '../../connectors/common';

export default class UnhedgedAlgoEngine extends AlgoEngine {
    constructor(params: AlgoEngineParameters) {
        super(params);
    }

    async init() {
        await this.perp.client.subscribePositionChangedEvent(this.onPositionChangedEvent);
        const perpPosition = await this.perp.client.getPosition(this.perp.market);

        // 1. Initialize state
        if (this.closeOnly) {
            this.state = State.CLOSING;
        } else if (perpPosition) {
            if (
                Math.abs(perpPosition.openNotionalOriginal.toNumber()) - this.totalNotional >
                this.acceptableDifference
            ) {
                throw new Error(`Open notional is more than requested total notional`);
            } else {
                this.state = State.OPENING;
            }
        }

        this.runnerInterval = setInterval(() => this.run(), this.INTERVAL);
        console.log(`${this.perp.market.baseToken} - Algo execution successfully initialized`);
    }

    /**
     * Creates one-off event listener for fill.
     * If no fill is received after TIMEOUT_INTERVAL ms, one-off event listener is destroyed and returns to regular flow.
     * @param state
     */
    onPerpFill() {
        // create timeout
        const timeout = setTimeout(() => this.handleTimeout(), this.TIMEOUT_INTERVAL);
        this.eventEmitter.once('perp_fill', async () => {
            // clear timeout before placing order to avoid race condition
            clearTimeout(timeout);
            console.log(`${this.perp.market.baseToken} - Received perp fill`);

            this.execution.onSuccess();
            this.pendingOrder = false;
        });
    }

    async placePerpOrder(orderSize: number, direction: Direction) {
        try {
            this.onPerpFill();
            this.pendingOrder = true;
            await this.perp.client.placeOrder({
                market: this.perp.market,
                slippage: this.slippage,
                direction,
                size: orderSize,
            });
        } catch (err) {
            this.pendingOrder = false;
            throw err;
        }
    }

    /**
     * Runner for OPENING state.
     * @param perpPosition
     * @param hedgePosition
     * @returns
     */
    private async pollOpening(perpPosition: PerpPosition | null) {
        // 1. check if position is complete
        if (perpPosition) {
            const perpEntryNotional = Math.abs(perpPosition.openNotionalOriginal.toNumber());
            const perpNotionalDiff = perpEntryNotional - this.totalNotional;
            if (Math.abs(perpNotionalDiff) < this.acceptableDifference) {
                console.log(
                    `${this.perp.market.baseToken} - ${this.state} Algo execution complete. Perp notional: ${perpEntryNotional}`
                );
                clearInterval(this.runnerInterval);
                return;
            }

            let skipIteration = false;
            // downsize to total notional if we have opened too much
            if (perpNotionalDiff > this.acceptableDifference) {
                const downsizeDirection = Direction.opposite(this.perp.direction);
                const perpPrice = await this.perp.client.quote({
                    market: this.perp.market,
                    amount: perpNotionalDiff,
                    direction: downsizeDirection, // we are downsizing so use the opposite direction
                    amountType: 'quote',
                });
                const sizeToDownsize = perpNotionalDiff / perpPrice.averagePrice;
                console.log(
                    `${this.perp.market.baseToken} - Downsizing perp ${downsizeDirection} ${sizeToDownsize}`
                );
                await this.placePerpOrder(sizeToDownsize, downsizeDirection); // we are downsizing so use the opposite direction
                skipIteration = true;
            }
            if (skipIteration) return;
        }

        // 2. check execution condition
        const canExecuteResponse = await this.execution.canExecute();
        console.log(
            `${this.perp.market.baseToken} - Execution condition met: ${!!canExecuteResponse}`
        );
        if (!canExecuteResponse) return;

        let orderSize = canExecuteResponse.orderSize;
        const perpEntryNotional = Math.abs(perpPosition?.openNotionalOriginal.toNumber() || 0);
        // recalc order size if remaining notional is less than order notional
        if (this.totalNotional - perpEntryNotional < this.execution.orderNotional) {
            orderSize = (this.totalNotional - perpEntryNotional) / canExecuteResponse.price;
        }

        console.log(
            `${this.perp.market.baseToken} - Executing perp order. ${this.perp.direction} ${orderSize}...`
        );
        await this.placePerpOrder(orderSize, this.perp.direction);
    }

    /**
     * Runner for CLOSING state.
     * @param perpPosition
     * @param hedgePosition
     * @returns
     */
    private async pollClosing(perpPosition: PerpPosition | null) {
        // 1. check if position is complete
        if (!perpPosition) {
            console.log(`${this.perp.market.baseToken} - ${this.state} Algo execution complete`);
            clearInterval(this.runnerInterval);
            return;
        }

        // 2. check execution condition
        const canExecuteResponse = await this.execution.canExecute();
        console.log(
            `${this.perp.market.baseToken} - Execution condition met: ${!!canExecuteResponse}`
        );
        if (!canExecuteResponse) return;

        if ((perpPosition?.sizeAbs?.toNumber() || 0) < canExecuteResponse.orderSize) {
            // Call explicit close position when we get to the final leg to avoid dust positions
            console.log(`${this.perp.market.baseToken} - Closing remaining perp position...`);
            await this.perp.client.closePosition(this.perp.market);
            return;
        }

        console.log(
            `${this.perp.market.baseToken} - Executing perp order. ${this.perp.direction} ${canExecuteResponse.orderSize}...`
        );
        await this.placePerpOrder(canExecuteResponse.orderSize, this.perp.direction);
    }

    async run() {
        if (this.running || this.pendingOrder) return;
        this.running = true;

        try {
            const perpPosition = await this.perp.client.getPosition(this.perp.market);
            console.log(
                `${this.perp.market.baseToken} - Perp position: ${perpPosition?.sizeAbs || 0}`
            );

            if (this.state === State.OPENING) {
                await this.pollOpening(perpPosition);
            } else {
                await this.pollClosing(perpPosition);
            }
        } catch (err: unknown) {
            console.log(
                `${this.perp.market.baseToken} - Failed runner iteration: ${(err as Error).message}`
            );
        } finally {
            this.running = false;
        }
    }
}
