// @x0xdead | 2024

import { getFullnodeUrl, SuiClient } from "@mysten/sui.js/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import BigNumber from "bignumber.js";
import fs from "fs";
import { Twisters } from "twisters";
import delay from "delay";
import { getCoinOfValue } from "@polymedia/suits";

const CLAIM_PACKAGE_ID =
  "0x1efaf509c9b7e986ee724596f526a22b474b15c376136772c00b8452f204d2d1";
const CLAIM_OBJECT_ID =
  "0x4846a1f1030deffd9dea59016402d832588cf7e0c27b9e4c1a63d2b5e152873a";
const OCEAN_PACKAGE_ID =
  "0xa8816d3a6e3136e86bc2873b1f94a15cadc8af2703c075f2d546c2ae367f4df9";
const OCEAN_COIN_TYPE = `${OCEAN_PACKAGE_ID}::ocean::OCEAN`;

function calculateBalance(totalBalance, divider) {
  return Number(totalBalance) / Math.pow(10, divider);
}

function reverseCalculateBalance(balance, multiplier) {
  return balance * Math.pow(10, multiplier);
}

const calculateFinishingInfo = (data, state) => {
  if (!data)
    return {
      timeToClaim: 0,
      unClaimedAmount: 0,
      progress: 0,
    };
  if (!state)
    return {
      timeToClaim: 0,
      unClaimedAmount: calculateBalance(data.initReward, 9),
      progress: 100,
    };
  const boatLevel = data.boatLevel[state.boat],
    meshLevel = data.meshLevel[state.mesh],
    fishTypeLevel = data.fishTypeLevel[state.seafood],
    currentTime = new Date().getTime();
  let timeSinceLastClaim = new BigNumber(0),
    fishingTime = (boatLevel.fishing_time * 60 * 60 * 1e3) / 1e4;
  if (new BigNumber(state.last_claim).plus(fishingTime).gt(currentTime)) {
    timeSinceLastClaim = new BigNumber(state.last_claim)
      .plus(fishingTime)
      .minus(currentTime);
  }
  let estimatedFishingAmount = new BigNumber(fishingTime)
    .minus(timeSinceLastClaim)
    .div(fishingTime)
    .times(boatLevel.fishing_time)
    .div(1e4)
    .times(meshLevel.speed)
    .div(1e4)
    .times(fishTypeLevel.rate)
    .div(1e4);
  if (state.special_boost) {
    let specialBoost = data.specialBoost[state.special_boost];
    if (
      specialBoost.type == 0 &&
      currentTime >= specialBoost.start_time &&
      currentTime <= specialBoost.start_time + specialBoost.duration
    ) {
      estimatedFishingAmount = estimatedFishingAmount
        .times(specialBoost.rate)
        .div(1e4);
    }
    if (
      specialBoost.type == 1 &&
      currentTime >= state.special_boost_start_time &&
      currentTime <= state.special_boost_start_time + specialBoost.duration
    ) {
      estimatedFishingAmount = estimatedFishingAmount
        .times(specialBoost.rate)
        .div(1e4);
    }
  }
  return {
    timeToClaim: timeSinceLastClaim.toNumber(),
    unClaimedAmount: estimatedFishingAmount.toFixed(5),
    progress: new BigNumber(fishingTime)
      .minus(timeSinceLastClaim)
      .times(100)
      .div(fishingTime),
  };
};

const makeClaimTx = (client, keypair, suiAddress) =>
  new Promise(async (resolve, reject) => {
    try {
      const gasBudget = "10000000";

      const txb = new TransactionBlock();
      txb.moveCall({
        target: `${CLAIM_PACKAGE_ID}::game::claim`,
        arguments: [txb.object(CLAIM_OBJECT_ID), txb.object("0x6")],
      });
      txb.setGasBudget(gasBudget);
      txb.setSender(suiAddress);

      const { bytes, signature } = await txb.sign({
        client,
        signer: keypair,
      });

      resolve({
        bytes,
        signature,
      });
    } catch (error) {
      reject(error);
    }
  });

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

const readFileToJSON = (path) => {
  return JSON.parse(fs.readFileSync(path, "utf8"));
};

const client = new SuiClient({
  url: getFullnodeUrl("mainnet"),
});

const getBalance = async (address, coinType, decimals = 9) => {
  try {
    const getBalance = await client.getBalance({
      owner: address,
      coinType: coinType,
    });
    let formattedBalance = await calculateBalance(
      getBalance.totalBalance,
      decimals
    );
    return {
      status: true,
      balance: getBalance.totalBalance,
      formattedBalance: formattedBalance,
    };
  } catch (error) {
    return {
      status: false,
      balance: 0,
      formattedBalance: 0,
    };
  }
};

const parseMnemonicToKeypair = async (mnemonic) => {
  const keypair = Ed25519Keypair.deriveKeypair(mnemonic);
  const suiAddress = keypair.getPublicKey().toSuiAddress();

  return {
    keypair,
    suiAddress,
  };
};

const getClaimInfo = async (suiAddress) => {
  try {
    const userClaimInfo = await client.getDynamicFieldObject({
      parentId: CLAIM_OBJECT_ID,
      name: {
        type: "address",
        value: suiAddress,
      },
    });
    const dataUserClaimInfo = userClaimInfo.data.content.fields;
    return {
      status: true,
      data: dataUserClaimInfo,
    };
  } catch (error) {
    return {
      status: false,
      data: null,
    };
  }
};

const buildTxTransfer = async (
  suiAddress,
  amountToSendResult,
  destinationAddress,
  keypair
) => {
  const txbTfOcean = new TransactionBlock();
  const [coin] = await getCoinOfValue(
    client,
    txbTfOcean,
    suiAddress,
    OCEAN_COIN_TYPE,
    amountToSendResult
  );
  txbTfOcean.transferObjects([coin], txbTfOcean.pure(destinationAddress));
  const gasBudget = "10000000";
  txbTfOcean.setGasBudget(gasBudget);
  txbTfOcean.setSender(suiAddress);

  const { bytes, signature } = await txbTfOcean.sign({
    client,
    signer: keypair,
  });

  return {
    bytes,
    signature,
  };
};

(async () => {
  const loadConfig = readFileToJSON("./config.json");
  const mnemonicList = readFileToJSON("./mnemonic.json");
  const gameInfoData = fs.readFileSync("./gameInfo.json", "utf-8");
  const twisters = new Twisters();

  while (true) {
    await Promise.all(
      mnemonicList.map(async (mnemonic) => {
        const parsedMnemonic = await parseMnemonicToKeypair(mnemonic);
        const { keypair, suiAddress } = parsedMnemonic;

        const suiBalance = await getBalance(suiAddress, "0x2::sui::SUI");
        const oceanBalance = await getBalance(suiAddress, OCEAN_COIN_TYPE);

        const checkClaimInfo = await getClaimInfo(suiAddress);
        if (checkClaimInfo.status === true) {
          const resultWhenClaim = await calculateFinishingInfo(
            JSON.parse(gameInfoData),
            checkClaimInfo.data
          );

          const convertMsToMinute = resultWhenClaim.timeToClaim / 60000;

          twisters.put(suiAddress, {
            text: `[Address: ${suiAddress}] P ${resultWhenClaim.progress.toFixed(
              2
            )}% ${suiBalance.formattedBalance} SUI ${
              oceanBalance.formattedBalance
            } OCEAN UNCL ${
              resultWhenClaim.unClaimedAmount
            } OCEAN ±${convertMsToMinute.toFixed(2)}m`,
          });
          if (resultWhenClaim.progress >= 100) {
            twisters.put(suiAddress, {
              text: `[Address: ${suiAddress}] P ${resultWhenClaim.progress.toFixed(
                2
              )}% ${suiBalance.formattedBalance} SUI ${
                oceanBalance.formattedBalance
              } OCEAN UNCL ${
                resultWhenClaim.unClaimedAmount
              } OCEAN ±${convertMsToMinute.toFixed(2)}m - Claiming...`,
            });

            fs.appendFileSync(
              "logs.txt",
              `[${new Date().toISOString()}] Claiming ${suiAddress}\n`
            );
            try {
              const { bytes, signature } = await makeClaimTx(
                client,
                keypair,
                suiAddress
              );
              const txResult = await sendTransaction(client, bytes, signature);
              if (txResult.effects.status.status === "success") {
                twisters.put(suiAddress, {
                  text: `[Address: ${suiAddress}] P ${resultWhenClaim.progress.toFixed(
                    2
                  )}% ${suiBalance.formattedBalance} SUI ${
                    oceanBalance.formattedBalance
                  } OCEAN UNCL ${
                    resultWhenClaim.unClaimedAmount
                  } OCEAN ±${convertMsToMinute.toFixed(2)}m - Claimed`,
                });
                fs.appendFileSync(
                  "logs.txt",
                  `[${new Date().toISOString()}] Claimed ${suiAddress}\n`
                );

                if (
                  loadConfig.autoTransferMaxOcean === true ||
                  loadConfig.autoTransferMaxOcean === "true"
                ) {
                  if (loadConfig.destinationAddress != "") {
                    await delay(500);
                    twisters.put(suiAddress, {
                      text: `[Address: ${suiAddress}] P ${resultWhenClaim.progress.toFixed(
                        2
                      )}% ${suiBalance.formattedBalance} SUI ${
                        oceanBalance.formattedBalance
                      } OCEAN UNCL ${
                        resultWhenClaim.unClaimedAmount
                      } OCEAN ±${convertMsToMinute.toFixed(
                        2
                      )}m - Transfering...`,
                    });

                    fs.appendFileSync(
                      "logs.txt",
                      `[${new Date().toISOString()}] Transfering ${suiAddress}\n`
                    );

                    const destinationAddress = loadConfig.destinationAddress;
                    if (oceanBalance.status === true) {
                      const getNewBalance = await getBalance(
                        suiAddress,
                        OCEAN_COIN_TYPE
                      );
                      const amountToSendResult = getNewBalance.balance;
                      const { bytes, signature } = await buildTxTransfer(
                        suiAddress,
                        amountToSendResult,
                        destinationAddress,
                        keypair
                      );

                      try {
                        const txTfResult = await sendTransaction(
                          client,
                          bytes,
                          signature
                        );
                        if (txTfResult.effects.status.status === "success") {
                          twisters.put(suiAddress, {
                            text: `[Address: ${suiAddress}] P ${resultWhenClaim.progress.toFixed(
                              2
                            )}% ${suiBalance.formattedBalance} SUI ${
                              oceanBalance.formattedBalance
                            } OCEAN UNCL ${
                              resultWhenClaim.unClaimedAmount
                            } OCEAN ±${convertMsToMinute.toFixed(
                              2
                            )}m - Transfered`,
                          });

                          fs.appendFileSync(
                            "logs.txt",
                            `[${new Date().toISOString()}] Transfered ${suiAddress}\n`
                          );
                        } else {
                          twisters.put(suiAddress, {
                            text: `[Address: ${suiAddress}] P ${resultWhenClaim.progress.toFixed(
                              2
                            )}% ${suiBalance.formattedBalance} SUI ${
                              oceanBalance.formattedBalance
                            } OCEAN UNCL ${
                              resultWhenClaim.unClaimedAmount
                            } OCEAN ±${convertMsToMinute.toFixed(
                              2
                            )}m - Transfer Failed. [${
                              txTfResult.effects.status.status
                            }]`,
                          });

                          fs.appendFileSync(
                            "logs.txt",
                            `[${new Date().toISOString()}] Transfer Failed ${suiAddress} [${
                              txTfResult.effects.status.status
                            }]\n`
                          );
                        }
                      } catch (error) {
                        console.log(error);
                        twisters.put(suiAddress, {
                          text: `[Address: ${suiAddress}] P ${resultWhenClaim.progress.toFixed(
                            2
                          )}% ${suiBalance.formattedBalance} SUI ${
                            oceanBalance.formattedBalance
                          } OCEAN UNCL ${
                            resultWhenClaim.unClaimedAmount
                          } OCEAN ±${convertMsToMinute.toFixed(
                            2
                          )}m - Transfer Failed. [${error.message}]`,
                        });

                        fs.appendFileSync(
                          "logs.txt",
                          `[${new Date().toISOString()}] Transfer Failed ${suiAddress} [${
                            error.message
                          }]\n`
                        );
                      }
                    } else {
                      twisters.put(suiAddress, {
                        text: `[Address: ${suiAddress}] P ${resultWhenClaim.progress.toFixed(
                          2
                        )}% ${suiBalance.formattedBalance} SUI ${
                          oceanBalance.formattedBalance
                        } OCEAN UNCL ${
                          resultWhenClaim.unClaimedAmount
                        } OCEAN ±${convertMsToMinute.toFixed(
                          2
                        )}m - Transfer Failed. [Failed to get balance]`,
                      });

                      fs.appendFileSync(
                        "logs.txt",
                        `[${new Date().toISOString()}] Transfer Failed ${suiAddress} [Failed to get balance]\n`
                      );
                    }
                  }
                }
              } else {
                twisters.put(suiAddress, {
                  text: `[Address: ${suiAddress}] P ${resultWhenClaim.progress.toFixed(
                    2
                  )}% ${suiBalance.formattedBalance} SUI ${
                    oceanBalance.formattedBalance
                  } OCEAN UNCL ${
                    resultWhenClaim.unClaimedAmount
                  } OCEAN ±${convertMsToMinute.toFixed(2)}m - Claim Failed. [${
                    txResult.effects.status.status
                  }]`,
                });
                fs.appendFileSync(
                  "logs.txt",
                  `[${new Date().toISOString()}] Claim Failed ${suiAddress}\n`
                );
              }
            } catch (err) {
              console.log(err);
              twisters.put(suiAddress, {
                text: `[Address: ${suiAddress}] - Claim Failed. [${err.message}]`,
              });
              fs.appendFileSync(
                "logs.txt",
                `[${new Date().toISOString()}] Claim Failed ${suiAddress} ${
                  err.message
                }\n`
              );
            }
          }
        } else {
          twisters.put(suiAddress, {
            text: `[Address: ${suiAddress}] Failed to fetch claim info`,
          });
        }
      })
    );
    // Delay 0.5s for each loop
    await delay(500);
  }
})();
