require("dotenv").config();
import Client, {
  CommitmentLevel,
  SubscribeRequestAccountsDataSlice,
  SubscribeRequestFilterAccounts,
  SubscribeRequestFilterBlocks,
  SubscribeRequestFilterBlocksMeta,
  SubscribeRequestFilterEntry,
  SubscribeRequestFilterSlots,
  SubscribeRequestFilterTransactions,
} from "@triton-one/yellowstone-grpc";
import { SubscribeRequestPing } from "@triton-one/yellowstone-grpc/dist/grpc/geyser";
import { PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { Idl } from "@project-serum/anchor";
import { SolanaParser } from "@shyft-to/solana-transaction-parser";
import { TransactionFormatter } from "./utils/transaction-formatter";
import pumpFunIdl from "./idls/pump_0.1.0.json";
import { SolanaEventParser } from "./utils/event-parser";
import { bnLayoutFormatter } from "./utils/bn-layout-formatter";
import { transactionOutput } from "./utils/transactionOutput";

interface SubscribeRequest {
  accounts: { [key: string]: SubscribeRequestFilterAccounts };
  slots: { [key: string]: SubscribeRequestFilterSlots };
  transactions: { [key: string]: SubscribeRequestFilterTransactions };
  transactionsStatus: { [key: string]: SubscribeRequestFilterTransactions };
  blocks: { [key: string]: SubscribeRequestFilterBlocks };
  blocksMeta: { [key: string]: SubscribeRequestFilterBlocksMeta };
  entry: { [key: string]: SubscribeRequestFilterEntry };
  commitment?: CommitmentLevel | undefined;
  accountsDataSlice: SubscribeRequestAccountsDataSlice[];
  ping?: SubscribeRequestPing | undefined;
}

const TXN_FORMATTER = new TransactionFormatter();
const PUMP_FUN_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);
const PUMP_FUN_IX_PARSER = new SolanaParser([]);
PUMP_FUN_IX_PARSER.addParserFromIdl(
  PUMP_FUN_PROGRAM_ID.toBase58(),
  pumpFunIdl as Idl
);
const PUMP_FUN_EVENT_PARSER = new SolanaEventParser([], console);
PUMP_FUN_EVENT_PARSER.addParserFromIdl(
  PUMP_FUN_PROGRAM_ID.toBase58(),
  pumpFunIdl as Idl
);

async function handleStream(client: Client, args: SubscribeRequest) {
  // Subscribe for events
  const stream = await client.subscribe();

  // Create `error` / `end` handler
  const streamClosed = new Promise<void>((resolve, reject) => {
    stream.on("error", (error) => {
      console.log("ERROR", error);
      reject(error);
      stream.end();
    });
    stream.on("end", () => {
      resolve();
    });
    stream.on("close", () => {
      resolve();
    });
  });

  // Handle updates
  stream.on("data", (data) => {
    if (data?.transaction) {
      const tx = TXN_FORMATTER.formTransactionFromJson(
        data.transaction,
        Date.now()
      );
      // console.log("Transaction is ", tx);
      const tokenAddress = tx.meta?.postTokenBalances?.[0]?.mint;

      console.log("Token Address:", tokenAddress);
      const preInfo = tx.meta?.preTokenBalances;
      const postInfo = tx.meta?.postTokenBalances;
      const preBal = tx.meta.preBalances;
      const postBal = tx.meta.postBalances;
      const preSolAmount = preBal[0];
      const postSolAmount = postBal[0];
      const preTokenInfo = preInfo?.find(
        (item) => item.owner === "2ois1yQ7pEQjQkjohnN9rYBk8HWmAfCStWCFzc535W72" && item.mint === tokenAddress
      );
      const postTokenInfo = postInfo?.find(
        (item) => item.owner === "2ois1yQ7pEQjQkjohnN9rYBk8HWmAfCStWCFzc535W72" && item.mint === tokenAddress
      );




      const preAmount = preTokenInfo?.uiTokenAmount.uiAmount || 0;
      const postAmount = postTokenInfo?.uiTokenAmount.uiAmount || 0;
      if (postAmount > preAmount) {
        console.log(
          `💳buying...\npreAmount: ${preAmount}\npostAmount: ${postAmount}\ntokenAmount: ${postAmount - preAmount}\nSolAmount${preSolAmount - postSolAmount}`
        );  
      } else if (postAmount < preAmount) {
        console.log(
          `💳selling...\npreAmount: ${preAmount}\npostAmount: ${postAmount}\ntokenAmount: ${preAmount - postAmount}\nSolAmount${preSolAmount - postSolAmount}`
        );
      }
    }
  });
  // Send subscribe request
  await new Promise<void>((resolve, reject) => {
    stream.write(args, (err: any) => {
      if (err === null || err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).catch((reason) => {
    console.error(reason);
    throw reason;
  });

  await streamClosed;
}

async function subscribeCommand(client: Client, args: SubscribeRequest) {
  while (true) {
    try {
      await handleStream(client, args);
    } catch (error) {
      console.error("Stream error, restarting in 1 second...", error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

const client = new Client(process.env.GRPC_URL, process.env.X_TOKEN, undefined);
const req: SubscribeRequest = {
  accounts: {},
  slots: {},
  transactions: {
    pumpFun: {
      vote: false,
      failed: false,
      signature: undefined,
      accountInclude: ["2ois1yQ7pEQjQkjohnN9rYBk8HWmAfCStWCFzc535W72"],
      accountExclude: [],
      accountRequired: [],
    },
  },
  transactionsStatus: {},
  entry: {},
  blocks: {},
  blocksMeta: {},
  accountsDataSlice: [],
  ping: undefined,
  commitment: CommitmentLevel.CONFIRMED,
};
subscribeCommand(client, req);

