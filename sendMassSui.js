import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import BigNumber from "bignumber.js";
import fs from "fs";
import { Twisters } from "twisters";
import readlineSync from "readline-sync";
import chalk from "chalk";
import delay from "delay";
import { getCoinOfValue } from "@polymedia/suits";
import clear from "clear";

const sendTransaction = (client, bytes, signature) =>
  new Promise(async (resolve, reject) => {
    try {
      await client.dryRunTransactionBlock({
        transactionBlock: bytes,
      });
      const result = await client.executeTransactionBlock({
        signature: signature,
        transactionBlock: bytes,
        requestType: "WaitForLocalExecution",
        options: {
          showEffects: true,
        },
      });
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });

function calculateBalance(totalBalance, divider) {
  return Number(totalBalance) / Math.pow(10, divider);
}

function reverseCalculateBalance(balance, multiplier) {
  return balance * Math.pow(10, multiplier);
}
const gasBudget = "10000000";

const client = new SuiClient({
  url: getFullnodeUrl("mainnet"),
});

const readFileToJSON = (path) => {
  return JSON.parse(fs.readFileSync(path, "utf8"));
};

const main = async () => {
  const mnemonic = "ISI MNEMONIC YANG BANYAK SUI NYA";
  const keypair = Ed25519Keypair.deriveKeypair(mnemonic);
  const suiAddress = keypair.getPublicKey().toSuiAddress();

  const suiBalance = await client.getBalance({
    owner: suiAddress,
    coinType: "0x2::sui::SUI",
  });
  let suiBalanceFormatted = await calculateBalance(suiBalance.totalBalance, 9);

  if (suiBalance.totalBalance < 1) {
    console.log(`${suiAddress} Your have ${suiBalanceFormatted} SUI`);
    return;
  }

  console.log(`${suiAddress} | Your have ${suiBalanceFormatted} SUI`);

  const suiList = readFileToJSON("./suiList.json");
  await Promise.all(
    suiList.map(async (sui) => {
      const parseSui = sui.split(",");
      const targetAddress = parseSui[0];
      const amount = parseSui[1];
      const destinationAddress = targetAddress;

      const floatAmountTransfer = parseFloat(amount);
      const amountTransferReversed = reverseCalculateBalance(
        floatAmountTransfer,
        9
      );
      const txbTfSUI = new TransactionBlock();
      const coin = txbTfSUI.splitCoins(txbTfSUI.gas, [
        txbTfSUI.pure(amountTransferReversed),
      ]);
      txbTfSUI.transferObjects([coin], txbTfSUI.pure(destinationAddress));
      txbTfSUI.setGasBudget(gasBudget);
      txbTfSUI.setSender(suiAddress);

      const { bytes, signature } = await txbTfSUI.sign({
        client,
        signer: keypair,
      });
      const txTfResult = await sendTransaction(client, bytes, signature);
      if (txTfResult.effects.status.status === "success") {
        console.log(
          `Transfer ${floatAmountTransfer} SUI to ${destinationAddress} - Success`
        );
      } else {
        console.log(
          `Transfer ${floatAmountTransfer} SUI to ${destinationAddress} - Failed`
        );
      }
    })
  );
};

main().catch((error) => {
  console.error(error);
});
