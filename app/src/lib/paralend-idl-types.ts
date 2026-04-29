/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/paralend.json`.
 */
export type Paralend = {
  "address": "2kZNrHd7QkUemYCLFw5dYGQWeKieAUNb5C1FvTjTYiC8",
  "metadata": {
    "name": "paralend",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Credit layer for prediction markets on Solana"
  },
  "instructions": [
    {
      "name": "acceptOwnership",
      "discriminator": [
        172,
        23,
        43,
        13,
        238,
        213,
        85,
        150
      ],
      "accounts": [
        {
          "name": "pendingOwner",
          "signer": true
        },
        {
          "name": "protocolState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "accrueInterest",
      "discriminator": [
        47,
        40,
        115,
        198,
        91,
        12,
        222,
        49
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "irm"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "attestPrice",
      "discriminator": [
        47,
        211,
        127,
        29,
        91,
        178,
        117,
        133
      ],
      "accounts": [
        {
          "name": "attester",
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "priceCache",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101,
                  95,
                  99,
                  97,
                  99,
                  104,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "newSpotWad",
          "type": "u128"
        }
      ]
    },
    {
      "name": "borrow",
      "discriminator": [
        228,
        253,
        131,
        202,
        207,
        116,
        89,
        18
      ],
      "accounts": [
        {
          "name": "borrower",
          "signer": true
        },
        {
          "name": "protocolState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "irm"
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              },
              {
                "kind": "account",
                "path": "borrower"
              }
            ]
          }
        },
        {
          "name": "loanVault",
          "docs": [
            "Source: market's loan vault (protocol lends from here)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "receiverLoanAta",
          "docs": [
            "Destination: borrower's loan token account"
          ],
          "writable": true
        },
        {
          "name": "priceCache",
          "docs": [
            "Collateral PriceCache — EMA of attested Kalshi/DFlow prices. Binds to",
            "(market_id, collateral_oracle_feed_id) and staleness-checked."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101,
                  95,
                  99,
                  97,
                  99,
                  104,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "assets",
          "type": "u64"
        },
        {
          "name": "maxShares",
          "type": "u128"
        }
      ]
    },
    {
      "name": "claimFees",
      "discriminator": [
        82,
        251,
        233,
        156,
        12,
        52,
        184,
        202
      ],
      "accounts": [
        {
          "name": "feeRecipient",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "The fee_recipient's position in this market.",
            "If it doesn't exist, the caller must create it first via create_position."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              },
              {
                "kind": "account",
                "path": "feeRecipient"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "closePosition",
      "discriminator": [
        123,
        134,
        81,
        0,
        49,
        68,
        98,
        98
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "Position owner must sign to close"
          ],
          "signer": true
        },
        {
          "name": "rentRecipient",
          "docs": [
            "Rent recipient — typically the owner, but can be different"
          ],
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "createIrm",
      "discriminator": [
        250,
        88,
        125,
        96,
        211,
        24,
        209,
        8
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "irm",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  110,
                  101,
                  97,
                  114,
                  95,
                  105,
                  114,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "baseRate",
          "type": "u128"
        },
        {
          "name": "slope1",
          "type": "u128"
        },
        {
          "name": "slope2",
          "type": "u128"
        },
        {
          "name": "kink",
          "type": "u128"
        },
        {
          "name": "nonce",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createMarket",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "collateralMint"
        },
        {
          "name": "loanMint"
        },
        {
          "name": "irmAccount"
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "collateralVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "loanVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "collateralOracleFeedId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "loanOracleFeedId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "irmKey",
          "type": "pubkey"
        },
        {
          "name": "lltv",
          "type": "u64"
        },
        {
          "name": "fee",
          "type": "u64"
        },
        {
          "name": "resolutionTimestamp",
          "type": "i64"
        },
        {
          "name": "kalshiTicker",
          "type": {
            "array": [
              "u8",
              48
            ]
          }
        }
      ]
    },
    {
      "name": "createPosition",
      "discriminator": [
        48,
        215,
        197,
        153,
        96,
        203,
        180,
        133
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "owner"
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "enableIrm",
      "discriminator": [
        186,
        29,
        17,
        189,
        228,
        25,
        238,
        179
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "protocolState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "irm",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "enableLltv",
      "discriminator": [
        70,
        117,
        38,
        77,
        18,
        118,
        13,
        102
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "protocolState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "lltv",
          "type": "u64"
        }
      ]
    },
    {
      "name": "forceClosePosition",
      "discriminator": [
        109,
        177,
        151,
        242,
        227,
        130,
        79,
        37
      ],
      "accounts": [
        {
          "name": "liquidator",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "irm"
        },
        {
          "name": "borrowerPosition",
          "docs": [
            "Borrower whose position is being force-closed."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              },
              {
                "kind": "account",
                "path": "borrower"
              }
            ]
          }
        },
        {
          "name": "borrower"
        },
        {
          "name": "liquidatorLoanAta",
          "docs": [
            "Liquidator's loan token account — debt repayment source"
          ],
          "writable": true
        },
        {
          "name": "loanVault",
          "docs": [
            "Market's loan vault — debt repayment destination"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "collateralVault",
          "docs": [
            "Market's collateral vault — seized collateral source"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "liquidatorCollateralAta",
          "docs": [
            "Liquidator's collateral token account — seized collateral destination"
          ],
          "writable": true
        },
        {
          "name": "priceCache",
          "docs": [
            "PriceCache for collateral valuation"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101,
                  95,
                  99,
                  97,
                  99,
                  104,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "handleResolution",
      "discriminator": [
        33,
        41,
        10,
        164,
        87,
        210,
        243,
        110
      ],
      "accounts": [
        {
          "name": "attester",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "priceCache",
          "docs": [
            "Attester authorization is enforced via the PriceCache: only the",
            "registered attester for this market can finalise resolution."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101,
                  95,
                  99,
                  97,
                  99,
                  104,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "outcomeBit",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initializeProtocol",
      "discriminator": [
        188,
        233,
        252,
        106,
        134,
        146,
        202,
        91
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Payer must match the owner argument (enforced in handler)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "owner",
          "type": "pubkey"
        },
        {
          "name": "feeRecipient",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "liquidate",
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "liquidator",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "irm"
        },
        {
          "name": "borrowerPosition",
          "docs": [
            "The borrower being liquidated"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              },
              {
                "kind": "account",
                "path": "borrower"
              }
            ]
          }
        },
        {
          "name": "borrower"
        },
        {
          "name": "liquidatorLoanAta",
          "docs": [
            "Source (debt repayment): liquidator's loan token account"
          ],
          "writable": true
        },
        {
          "name": "loanVault",
          "docs": [
            "Destination (debt repayment): market's loan vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "collateralVault",
          "docs": [
            "Source (collateral seizure): market's collateral vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "liquidatorCollateralAta",
          "docs": [
            "Destination (collateral seizure): liquidator's collateral token account"
          ],
          "writable": true
        },
        {
          "name": "priceCache",
          "docs": [
            "Collateral PriceCache (EMA of attested Kalshi/DFlow prices)."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101,
                  95,
                  99,
                  97,
                  99,
                  104,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "seizedCollateral",
          "type": "u64"
        }
      ]
    },
    {
      "name": "pokePrice",
      "discriminator": [
        118,
        36,
        242,
        97,
        231,
        213,
        139,
        144
      ],
      "accounts": [
        {
          "name": "priceCache",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101,
                  95,
                  99,
                  97,
                  99,
                  104,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "registerPriceCache",
      "discriminator": [
        168,
        197,
        108,
        105,
        242,
        56,
        121,
        30
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolState",
          "docs": [
            "Boxed: ProtocolState is ~900 B and overflows the BPF stack frame",
            "otherwise."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Market this cache will serve. Binds the cache's feed_id to",
            "`market.collateral_oracle_feed_id`."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "priceCache",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101,
                  95,
                  99,
                  97,
                  99,
                  104,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "attester",
          "type": "pubkey"
        },
        {
          "name": "initialPriceWad",
          "type": "u128"
        }
      ]
    },
    {
      "name": "repay",
      "discriminator": [
        234,
        103,
        67,
        82,
        208,
        234,
        219,
        166
      ],
      "accounts": [
        {
          "name": "repayer",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "irm"
        },
        {
          "name": "position",
          "docs": [
            "The borrower whose debt to repay (may differ from repayer — anyone can repay)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              },
              {
                "kind": "account",
                "path": "borrower"
              }
            ]
          }
        },
        {
          "name": "borrower"
        },
        {
          "name": "repayerLoanAta",
          "docs": [
            "Source: repayer's loan token account"
          ],
          "writable": true
        },
        {
          "name": "loanVault",
          "docs": [
            "Destination: market's loan vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "assets",
          "type": "u64"
        },
        {
          "name": "shares",
          "type": "u128"
        }
      ]
    },
    {
      "name": "rotateAttester",
      "discriminator": [
        169,
        25,
        52,
        29,
        129,
        33,
        133,
        215
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "protocolState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "priceCache",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101,
                  95,
                  99,
                  97,
                  99,
                  104,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "newAttester",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setFee",
      "discriminator": [
        18,
        154,
        24,
        18,
        237,
        214,
        19,
        80
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "protocolState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "fee",
          "type": "u64"
        }
      ]
    },
    {
      "name": "supply",
      "discriminator": [
        81,
        67,
        116,
        61,
        250,
        209,
        5,
        198
      ],
      "accounts": [
        {
          "name": "supplier",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "irm"
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              },
              {
                "kind": "account",
                "path": "supplier"
              }
            ]
          }
        },
        {
          "name": "supplierLoanAta",
          "docs": [
            "Source: supplier's loan token account (e.g. USDC wallet)"
          ],
          "writable": true
        },
        {
          "name": "loanVault",
          "docs": [
            "Destination: market's loan vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "assets",
          "type": "u64"
        },
        {
          "name": "minShares",
          "type": "u128"
        }
      ]
    },
    {
      "name": "supplyCollateral",
      "discriminator": [
        80,
        132,
        192,
        67,
        93,
        50,
        65,
        9
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "protocolState",
          "docs": [
            "Protocol state — blocks deposits when globally paused.",
            "Boxed to avoid BPF stack overflow (ProtocolState is ~900 bytes)."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Market account — blocks deposits on paused or resolved markets."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "Depositor's position in this market"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              },
              {
                "kind": "account",
                "path": "depositor"
              }
            ]
          }
        },
        {
          "name": "depositorCollateralAta",
          "docs": [
            "Source: depositor's collateral token account"
          ],
          "writable": true
        },
        {
          "name": "collateralVault",
          "docs": [
            "Destination: market's collateral vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "transferOwnership",
      "discriminator": [
        65,
        177,
        215,
        73,
        53,
        45,
        99,
        47
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "protocolState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newOwner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "irm"
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "loanVault",
          "docs": [
            "Source: market's loan vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "receiverLoanAta",
          "docs": [
            "Destination: receiver's loan token account"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "assets",
          "type": "u64"
        },
        {
          "name": "shares",
          "type": "u128"
        },
        {
          "name": "maxSharesBurn",
          "type": "u128"
        },
        {
          "name": "minAssetsOut",
          "type": "u128"
        }
      ]
    },
    {
      "name": "withdrawCollateral",
      "discriminator": [
        115,
        135,
        168,
        106,
        139,
        214,
        138,
        150
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "market",
          "docs": [
            "Market state — mutable because we accrue interest before the health check"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "irm",
          "docs": [
            "IRM account needed for interest accrual"
          ]
        },
        {
          "name": "position",
          "docs": [
            "Owner's position in this market"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "collateralVault",
          "docs": [
            "Source: market's collateral vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "receiverCollateralAta",
          "docs": [
            "Destination: receiver's collateral token account"
          ],
          "writable": true
        },
        {
          "name": "priceCache",
          "docs": [
            "Collateral PriceCache (EMA of attested Kalshi/DFlow prices).",
            "Only consumed if the position has outstanding debt."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  97,
                  108,
                  101,
                  110,
                  100
                ]
              },
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  99,
                  101,
                  95,
                  99,
                  97,
                  99,
                  104,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "linearIrm",
      "discriminator": [
        41,
        186,
        72,
        106,
        25,
        236,
        135,
        73
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    },
    {
      "name": "priceCache",
      "discriminator": [
        198,
        211,
        186,
        101,
        228,
        22,
        101,
        190
      ]
    },
    {
      "name": "protocolState",
      "discriminator": [
        33,
        51,
        173,
        134,
        35,
        140,
        195,
        248
      ]
    }
  ],
  "events": [
    {
      "name": "borrowed",
      "discriminator": [
        225,
        182,
        241,
        78,
        34,
        145,
        253,
        230
      ]
    },
    {
      "name": "collateralSupplied",
      "discriminator": [
        123,
        58,
        244,
        254,
        218,
        241,
        236,
        34
      ]
    },
    {
      "name": "collateralWithdrawn",
      "discriminator": [
        51,
        224,
        133,
        106,
        74,
        173,
        72,
        82
      ]
    },
    {
      "name": "feesClaimed",
      "discriminator": [
        22,
        104,
        110,
        222,
        38,
        157,
        14,
        62
      ]
    },
    {
      "name": "interestAccrued",
      "discriminator": [
        79,
        218,
        196,
        73,
        32,
        148,
        138,
        71
      ]
    },
    {
      "name": "irmEnabled",
      "discriminator": [
        172,
        158,
        227,
        189,
        114,
        44,
        76,
        19
      ]
    },
    {
      "name": "liquidated",
      "discriminator": [
        231,
        57,
        55,
        75,
        0,
        170,
        246,
        68
      ]
    },
    {
      "name": "lltvEnabled",
      "discriminator": [
        181,
        121,
        105,
        227,
        208,
        37,
        74,
        235
      ]
    },
    {
      "name": "marketCreated",
      "discriminator": [
        88,
        184,
        130,
        231,
        226,
        84,
        6,
        58
      ]
    },
    {
      "name": "marketResolved",
      "discriminator": [
        89,
        67,
        230,
        95,
        143,
        106,
        199,
        202
      ]
    },
    {
      "name": "ownershipTransferAccepted",
      "discriminator": [
        170,
        218,
        124,
        19,
        70,
        121,
        99,
        8
      ]
    },
    {
      "name": "ownershipTransferInitiated",
      "discriminator": [
        181,
        32,
        40,
        60,
        60,
        64,
        235,
        29
      ]
    },
    {
      "name": "positionForceClosed",
      "discriminator": [
        169,
        152,
        228,
        17,
        218,
        207,
        1,
        119
      ]
    },
    {
      "name": "priceAttested",
      "discriminator": [
        211,
        56,
        224,
        100,
        215,
        82,
        198,
        184
      ]
    },
    {
      "name": "priceCachePoked",
      "discriminator": [
        82,
        125,
        198,
        18,
        104,
        96,
        17,
        162
      ]
    },
    {
      "name": "priceCacheRegistered",
      "discriminator": [
        61,
        164,
        107,
        5,
        230,
        196,
        230,
        140
      ]
    },
    {
      "name": "protocolInitialized",
      "discriminator": [
        173,
        122,
        168,
        254,
        9,
        118,
        76,
        132
      ]
    },
    {
      "name": "repaid",
      "discriminator": [
        38,
        248,
        231,
        7,
        150,
        164,
        172,
        23
      ]
    },
    {
      "name": "supplied",
      "discriminator": [
        137,
        114,
        239,
        72,
        162,
        75,
        133,
        39
      ]
    },
    {
      "name": "withdrawn",
      "discriminator": [
        20,
        89,
        223,
        198,
        194,
        124,
        219,
        13
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Unauthorized: caller is not the protocol owner"
    },
    {
      "code": 6001,
      "name": "invalidLltv",
      "msg": "LLTV value is invalid (must be 0 < lltv < 10000)"
    },
    {
      "code": 6002,
      "name": "lltvAlreadyEnabled",
      "msg": "LLTV is already enabled"
    },
    {
      "code": 6003,
      "name": "maxLltvsReached",
      "msg": "Maximum number of LLTVs reached"
    },
    {
      "code": 6004,
      "name": "irmAlreadyEnabled",
      "msg": "IRM is already enabled"
    },
    {
      "code": 6005,
      "name": "maxIrmsReached",
      "msg": "Maximum number of IRMs reached"
    },
    {
      "code": 6006,
      "name": "lltvNotEnabled",
      "msg": "LLTV is not enabled in protocol state"
    },
    {
      "code": 6007,
      "name": "irmNotEnabled",
      "msg": "IRM is not enabled in protocol state"
    },
    {
      "code": 6008,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6009,
      "name": "divisionByZero",
      "msg": "Division by zero"
    },
    {
      "code": 6010,
      "name": "protocolPaused",
      "msg": "Protocol is paused"
    },
    {
      "code": 6011,
      "name": "marketPaused",
      "msg": "Market is paused"
    },
    {
      "code": 6012,
      "name": "zeroAmount",
      "msg": "Zero amount not allowed"
    },
    {
      "code": 6013,
      "name": "insufficientShares",
      "msg": "Insufficient supply shares"
    },
    {
      "code": 6014,
      "name": "insufficientLiquidity",
      "msg": "Insufficient liquidity in market"
    },
    {
      "code": 6015,
      "name": "insufficientCollateral",
      "msg": "Insufficient collateral"
    },
    {
      "code": 6016,
      "name": "positionUnhealthy",
      "msg": "Position is unhealthy after this operation"
    },
    {
      "code": 6017,
      "name": "positionHealthy",
      "msg": "Position is healthy and cannot be liquidated"
    },
    {
      "code": 6018,
      "name": "slippageExceeded",
      "msg": "Slippage tolerance exceeded"
    },
    {
      "code": 6019,
      "name": "oraclePriceStale",
      "msg": "Oracle price is stale"
    },
    {
      "code": 6020,
      "name": "oracleConfidenceTooWide",
      "msg": "Oracle confidence interval too wide"
    },
    {
      "code": 6021,
      "name": "oraclePriceNonPositive",
      "msg": "Oracle price is non-positive"
    },
    {
      "code": 6022,
      "name": "invalidInput",
      "msg": "Invalid input: specify exactly one of assets or shares"
    },
    {
      "code": 6023,
      "name": "invalidIrmConfig",
      "msg": "Invalid IRM configuration"
    },
    {
      "code": 6024,
      "name": "feeExceedsMax",
      "msg": "Fee exceeds maximum"
    },
    {
      "code": 6025,
      "name": "oracleFeedMismatch",
      "msg": "Oracle feed ID does not match market configuration"
    },
    {
      "code": 6026,
      "name": "positionNotEmpty",
      "msg": "Position is not empty and cannot be closed"
    },
    {
      "code": 6027,
      "name": "marketNotActive",
      "msg": "Market is not active (may be in pre-resolution or resolved)"
    },
    {
      "code": 6028,
      "name": "marketResolved",
      "msg": "Market is already resolved"
    },
    {
      "code": 6029,
      "name": "resolutionTooEarly",
      "msg": "Resolution cannot happen yet — T_resolution not reached"
    },
    {
      "code": 6030,
      "name": "forceCloseWindowClosed",
      "msg": "Force-close window is closed"
    },
    {
      "code": 6031,
      "name": "lltvDecayViolation",
      "msg": "Time-decay LLTV violation — position unhealthy under effective LLTV"
    },
    {
      "code": 6032,
      "name": "priceDeviationExceeded",
      "msg": "Oracle spot deviates more than permitted band from EMA"
    },
    {
      "code": 6033,
      "name": "attesterNotAuthorized",
      "msg": "Caller is not the registered attester"
    },
    {
      "code": 6034,
      "name": "invalidOutcome",
      "msg": "Invalid outcome bit (must be 1=YES or 2=NO)"
    }
  ],
  "types": [
    {
      "name": "borrowed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "borrower",
            "type": "pubkey"
          },
          {
            "name": "receiver",
            "type": "pubkey"
          },
          {
            "name": "assets",
            "type": "u128"
          },
          {
            "name": "shares",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "collateralSupplied",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "onBehalfOf",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "collateralWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "caller",
            "type": "pubkey"
          },
          {
            "name": "receiver",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "feesClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "feeRecipient",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "interestAccrued",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "interest",
            "type": "u128"
          },
          {
            "name": "feeShares",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "irmEnabled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "irm",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "linearIrm",
      "docs": [
        "Linear kinked interest rate model",
        "Below kink: rate = base_rate + slope1 * utilization / WAD",
        "Above kink: rate = base_rate + slope1 * kink / WAD + slope2 * (utilization - kink) / WAD",
        "",
        "All rates are stored as per-second rates, WAD-scaled."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          },
          {
            "name": "baseRate",
            "docs": [
              "Base rate per second (WAD-scaled). Usually 0."
            ],
            "type": "u128"
          },
          {
            "name": "slope1",
            "docs": [
              "Slope of the rate curve below the kink, per second, WAD-scaled",
              "Example: for 5% APY slope → 5 * WAD / 100 / SECONDS_PER_YEAR"
            ],
            "type": "u128"
          },
          {
            "name": "slope2",
            "docs": [
              "Slope of the rate curve above the kink, per second, WAD-scaled"
            ],
            "type": "u128"
          },
          {
            "name": "kink",
            "docs": [
              "Utilization kink point (WAD-scaled, e.g., 0.8 WAD = 80%)"
            ],
            "type": "u128"
          },
          {
            "name": "admin",
            "docs": [
              "Creator of this IRM"
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "liquidated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "liquidator",
            "type": "pubkey"
          },
          {
            "name": "borrower",
            "type": "pubkey"
          },
          {
            "name": "repaidAssets",
            "type": "u128"
          },
          {
            "name": "repaidShares",
            "type": "u128"
          },
          {
            "name": "seizedCollateral",
            "type": "u128"
          },
          {
            "name": "badDebtAssets",
            "type": "u128"
          },
          {
            "name": "badDebtShares",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "lltvEnabled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lltv",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          },
          {
            "name": "collateralVaultBump",
            "docs": [
              "Collateral vault PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "loanVaultBump",
            "docs": [
              "Loan vault PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "collateralMint",
            "docs": [
              "Collateral token mint"
            ],
            "type": "pubkey"
          },
          {
            "name": "loanMint",
            "docs": [
              "Loan token mint"
            ],
            "type": "pubkey"
          },
          {
            "name": "collateralDecimals",
            "docs": [
              "Cached collateral token decimals"
            ],
            "type": "u8"
          },
          {
            "name": "loanDecimals",
            "docs": [
              "Cached loan token decimals"
            ],
            "type": "u8"
          },
          {
            "name": "collateralOracleFeedId",
            "docs": [
              "Pyth price feed ID for collateral/USD"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "loanOracleFeedId",
            "docs": [
              "Pyth price feed ID for loan/USD (all zeros = assume $1 for stablecoins)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "irm",
            "docs": [
              "Interest rate model account"
            ],
            "type": "pubkey"
          },
          {
            "name": "lltv",
            "docs": [
              "Liquidation loan-to-value in BPS (e.g., 8600 = 86%)"
            ],
            "type": "u64"
          },
          {
            "name": "fee",
            "docs": [
              "Protocol fee in BPS (e.g., 1000 = 10%)"
            ],
            "type": "u64"
          },
          {
            "name": "totalSupplyAssets",
            "docs": [
              "Total loan token assets supplied (grows with interest)"
            ],
            "type": "u128"
          },
          {
            "name": "totalSupplyShares",
            "docs": [
              "Total supply shares outstanding"
            ],
            "type": "u128"
          },
          {
            "name": "totalBorrowAssets",
            "docs": [
              "Total loan tokens borrowed (grows with interest)"
            ],
            "type": "u128"
          },
          {
            "name": "totalBorrowShares",
            "docs": [
              "Total borrow shares outstanding"
            ],
            "type": "u128"
          },
          {
            "name": "pendingFeeShares",
            "docs": [
              "Unclaimed protocol fee shares"
            ],
            "type": "u128"
          },
          {
            "name": "lastUpdate",
            "docs": [
              "Last interest accrual timestamp (unix)"
            ],
            "type": "i64"
          },
          {
            "name": "paused",
            "docs": [
              "Market-level pause flag"
            ],
            "type": "bool"
          },
          {
            "name": "marketStatus",
            "docs": [
              "Market lifecycle status (0=Active, 1=PreResolution, 2=Resolved)"
            ],
            "type": "u8"
          },
          {
            "name": "outcomeBit",
            "docs": [
              "Outcome bit after resolution (0=unresolved, 1=YES won, 2=NO won)"
            ],
            "type": "u8"
          },
          {
            "name": "resolutionTimestamp",
            "docs": [
              "Unix timestamp when this prediction market resolves. 0 = no scheduled resolution."
            ],
            "type": "i64"
          },
          {
            "name": "baseLltv",
            "docs": [
              "Base liquidation LTV in BPS — effective LLTV decays as resolution approaches."
            ],
            "type": "u64"
          },
          {
            "name": "kalshiTicker",
            "docs": [
              "Kalshi market ticker (e.g., \"KXNBAFINAL-26MAYLAL\") — display metadata."
            ],
            "type": {
              "array": [
                "u8",
                48
              ]
            }
          },
          {
            "name": "reserved",
            "docs": [
              "Reserved for future use"
            ],
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          }
        ]
      }
    },
    {
      "name": "marketCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "loanMint",
            "type": "pubkey"
          },
          {
            "name": "irm",
            "type": "pubkey"
          },
          {
            "name": "lltv",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "marketResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "outcomeBit",
            "type": "u8"
          },
          {
            "name": "atTimestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "ownershipTransferAccepted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oldOwner",
            "type": "pubkey"
          },
          {
            "name": "newOwner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "ownershipTransferInitiated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oldOwner",
            "type": "pubkey"
          },
          {
            "name": "pendingOwner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          },
          {
            "name": "marketId",
            "docs": [
              "Market ID this position belongs to"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "owner",
            "docs": [
              "Position owner"
            ],
            "type": "pubkey"
          },
          {
            "name": "supplyShares",
            "docs": [
              "Lender's supply share balance"
            ],
            "type": "u128"
          },
          {
            "name": "borrowShares",
            "docs": [
              "Borrower's debt share balance"
            ],
            "type": "u128"
          },
          {
            "name": "collateral",
            "docs": [
              "Raw collateral token amount (not interest-bearing, tracks exact deposited amount)"
            ],
            "type": "u128"
          },
          {
            "name": "reserved",
            "docs": [
              "Reserved for future use"
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "positionForceClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "liquidator",
            "type": "pubkey"
          },
          {
            "name": "borrower",
            "type": "pubkey"
          },
          {
            "name": "seizedCollateral",
            "type": "u128"
          },
          {
            "name": "repaidAssets",
            "type": "u128"
          },
          {
            "name": "repaidShares",
            "type": "u128"
          },
          {
            "name": "bountyBps",
            "type": "u64"
          },
          {
            "name": "badDebtAssets",
            "type": "u128"
          },
          {
            "name": "badDebtShares",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "priceAttested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "spotWad",
            "type": "u128"
          },
          {
            "name": "emaWad",
            "type": "u128"
          },
          {
            "name": "slot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "priceCache",
      "docs": [
        "Crank-attested price cache for a market's collateral mint.",
        "",
        "One PriceCache exists per Paralend market. A permissioned off-chain",
        "attester (typically a daemon reading the Kalshi REST API) pushes recent",
        "spot prices via `attest_price`. Each attestation is:",
        "1. deviation-checked against the previous EMA (reject if > 5%)",
        "2. folded into an exponentially-weighted moving average",
        "3. timestamped for staleness checks on reads",
        "",
        "Consumers (borrow, withdraw_collateral, liquidate) read `ema_price_wad`",
        "and reject if `last_update_ts` is older than `MAX_ORACLE_AGE` seconds.",
        "",
        "Price convention (unchanged from v1):",
        "price_wad = USD per **base unit** of collateral, WAD-scaled (1e18)",
        "",
        "Example: Kalshi YES token at $0.42 (6 decimals) →",
        "price_wad = 0.42 * 1e18 / 1e6 = 420_000_000_000"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "docs": [
              "PDA bump seed."
            ],
            "type": "u8"
          },
          {
            "name": "marketId",
            "docs": [
              "Which market this cache covers (32-byte market_id)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "feedId",
            "docs": [
              "Kalshi/DFlow feed identifier — must match `market.collateral_oracle_feed_id`."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "attester",
            "docs": [
              "Only this key can push new spot prices via `attest_price`.",
              "For MVP this is a single keypair or multisig; v2 moves to an",
              "on-chain DFlow CLP TWAP that needs no attester."
            ],
            "type": "pubkey"
          },
          {
            "name": "emaPriceWad",
            "docs": [
              "Exponentially-weighted moving average price, WAD-scaled.",
              "Consumers read this field."
            ],
            "type": "u128"
          },
          {
            "name": "lastSpotWad",
            "docs": [
              "Last attested spot, kept for deviation bounding on the next attestation."
            ],
            "type": "u128"
          },
          {
            "name": "lastUpdateSlot",
            "docs": [
              "Slot of the last attestation (0 before first push)."
            ],
            "type": "u64"
          },
          {
            "name": "lastUpdateTs",
            "docs": [
              "Unix timestamp of the last attestation (used for staleness checks)."
            ],
            "type": "i64"
          },
          {
            "name": "reserved",
            "docs": [
              "Reserved for future fields (alpha, hysteresis, etc.)."
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "priceCachePoked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "slot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "priceCacheRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "feedId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "attester",
            "type": "pubkey"
          },
          {
            "name": "initialPriceWad",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "protocolInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "feeRecipient",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "protocolState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          },
          {
            "name": "owner",
            "docs": [
              "Protocol admin who can enable LLTVs, IRMs, set fees, pause"
            ],
            "type": "pubkey"
          },
          {
            "name": "pendingOwner",
            "docs": [
              "Address for two-step ownership transfer"
            ],
            "type": "pubkey"
          },
          {
            "name": "feeRecipient",
            "docs": [
              "Address that receives protocol fee shares"
            ],
            "type": "pubkey"
          },
          {
            "name": "paused",
            "docs": [
              "Global pause flag — blocks supply, borrow, collateral operations"
            ],
            "type": "bool"
          },
          {
            "name": "lltvCount",
            "docs": [
              "Number of enabled LLTV values"
            ],
            "type": "u8"
          },
          {
            "name": "enabledLltvs",
            "docs": [
              "Whitelisted LLTV values in BPS (e.g., 8600 = 86%)"
            ],
            "type": {
              "array": [
                "u64",
                20
              ]
            }
          },
          {
            "name": "irmCount",
            "docs": [
              "Number of enabled IRM accounts"
            ],
            "type": "u8"
          },
          {
            "name": "enabledIrms",
            "docs": [
              "Whitelisted IRM account pubkeys"
            ],
            "type": {
              "array": [
                "pubkey",
                10
              ]
            }
          },
          {
            "name": "marketCount",
            "docs": [
              "Total number of markets created"
            ],
            "type": "u64"
          },
          {
            "name": "reserved",
            "docs": [
              "Reserved space for future upgrades"
            ],
            "type": {
              "array": [
                "u8",
                256
              ]
            }
          }
        ]
      }
    },
    {
      "name": "repaid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "repayer",
            "type": "pubkey"
          },
          {
            "name": "onBehalfOf",
            "type": "pubkey"
          },
          {
            "name": "assets",
            "type": "u128"
          },
          {
            "name": "shares",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "supplied",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "supplier",
            "type": "pubkey"
          },
          {
            "name": "assets",
            "type": "u128"
          },
          {
            "name": "shares",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "withdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "caller",
            "type": "pubkey"
          },
          {
            "name": "receiver",
            "type": "pubkey"
          },
          {
            "name": "assets",
            "type": "u128"
          },
          {
            "name": "shares",
            "type": "u128"
          }
        ]
      }
    }
  ]
};
