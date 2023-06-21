import EventEmitter from 'events';
import { PositionChangedEvent } from '../../connectors/perpetual_protocol_v2';
import { bpsToNatural } from '../../utils/math';
import { Execution, ExecutionType } from '../execution/interface';
import { Spread } from '../execution/spread';
import { Twap } from '../execution/twap';
import { Event, PerpInfo, State } from '../interface';
import { AlgoEngineParameters } from './interface';

export abstract class AlgoEngine {
    /**
     * Poll interval.
     */
    protected readonly INTERVAL: number = 2000;
    /**
     * Timeout interval.
     */
    protected readonly TIMEOUT_INTERVAL: number = 30000;
    /**
     * Max slippage on perp.
     */
    protected readonly slippage: number = 50;
    /**
     * Upper bound for difference in notional value.
     * ie. If perp notional is $100, hedge notional must be no more than $105, or less than $95 etc.
     */
    protected readonly acceptableDifference: number = 5;
    protected readonly perp: PerpInfo;
    protected readonly totalNotional: number;
    protected readonly execution: Execution;
    protected readonly closeOnly: boolean = false;

    protected state: State = State.OPENING;
    protected running: boolean = false;
    protected runnerInterval?: NodeJS.Timer;
    protected pendingOrder: boolean = false;
    protected eventEmitter: EventEmitter;

    constructor(params: AlgoEngineParameters) {
        this.perp = params.perp;
        this.totalNotional = params.totalNotional;
        if (params.closeOnly) this.closeOnly = true;
        if (params.pollInterval) this.INTERVAL = params.pollInterval;
        if (params.slippage) this.slippage = params.slippage;
        if (params.acceptableDifference) this.acceptableDifference = params.acceptableDifference;
        let execution: Execution;
        if (params.executionParams.strategy === ExecutionType.Spread) {
            execution = new Spread({
                spread: params.executionParams,
                perp: params.perp,
                hedge: params.hedge,
                hideSize: params.hideSize || false,
            });
        } else {
            execution = new Twap({
                twap: params.executionParams,
                totalNotional: params.totalNotional,
                perp: params.perp,
                hedge: params.hedge,
                hideSize: params.hideSize || false,
            });
        }
        this.execution = execution;
        this.onPositionChangedEvent = this.onPositionChangedEvent.bind(this);
        this.eventEmitter = new EventEmitter();
    }

    /**
     * Handler called when a perp PositionChanged event is received.
     * Checks if event matches user's wallet and subscribed token and places corresponding hedge order.
     * @param params
     */
    async onPositionChangedEvent(params: PositionChangedEvent) {
        if (
            params.trader === this.perp.client.wallet.address &&
            params.baseToken === this.perp.client.baseTokenAddress(this.perp.market)
        ) {
            this.eventEmitter.emit(Event.PerpFill, params);
        }
    }

    /**
     * On timeout, destroys one-off event listener and returns to regular flow.
     */
    handleTimeout() {
        if (this.pendingOrder) {
            console.log(
                `${this.perp.market.baseToken} - Pending order timed out after ${
                    this.TIMEOUT_INTERVAL / 1000
                } secs...`
            );
            this.pendingOrder = false;
        }
    }
}
