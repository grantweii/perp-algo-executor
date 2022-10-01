import { HttpClient } from "../../connectors/interface";
import { PerpV2Client } from "../../connectors/perpetual_protocol_v2";
import { CanExecuteResponse, ExecutionRequest, FundingExecution, SpreadParameters } from "../interface";

export class Spread implements FundingExecution {
    private readonly perpClient: PerpV2Client;
    private readonly hedgeClient: HttpClient;
    private readonly orderNotional: number;
    private readonly maxSpread: number;

    constructor(params: SpreadParameters, perpClient: PerpV2Client, hedgeClient: HttpClient) {
        this.perpClient = perpClient;
        this.hedgeClient = hedgeClient;
        this.orderSize = params.
    }
    
    canExecute(): CanExecuteResponse {
        throw new Error("Method not implemented.");
    }
}