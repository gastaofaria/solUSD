import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { SolUsd } from "../target/types/sol_usd";

describe("sol-usd", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.solUsd as Program<SolUsd>;
  const provider = anchor.getProvider();

  // Shared test state
  let adminKeypair: Keypair;
  let userKeypair: Keypair;
  let mint: PublicKey;
  let troveManagerPda: PublicKey;
  let treasuryPda: PublicKey;
  let trovePda: PublicKey;
  let userTokenAccount: PublicKey;

  before(async () => {
    // Create admin account and airdrop SOL
    adminKeypair = Keypair.generate();
    const adminAirdropSignature = await provider.connection.requestAirdrop(
      adminKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(adminAirdropSignature);

    // Create user account and airdrop SOL
    userKeypair = Keypair.generate();
    const userAirdropSignature = await provider.connection.requestAirdrop(
      userKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(userAirdropSignature);

    // Create a mint for the collateral token
    mint = await createMint(
      provider.connection,
      adminKeypair,
      adminKeypair.publicKey,
      null,
      9 // 9 decimals
    );

    // Derive trove manager PDA
    [troveManagerPda] = PublicKey.findProgramAddressSync(
      [mint.toBuffer()],
      program.programId
    );

    // Derive treasury PDA
    [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), mint.toBuffer()],
      program.programId
    );

    // Derive trove PDA for user
    [trovePda] = PublicKey.findProgramAddressSync(
      [userKeypair.publicKey.toBuffer()],
      program.programId
    );

    // Derive user's associated token account
    userTokenAccount = getAssociatedTokenAddressSync(
      mint,
      userKeypair.publicKey
    );

    // Create user's token account
    await createAssociatedTokenAccount(
      provider.connection,
      userKeypair,
      mint,
      userKeypair.publicKey
    );

    // Mint tokens to user upfront for all tests
    const totalTokens = 30_000_000_000; // 30 tokens with 9 decimals
    await mintTo(
      provider.connection,
      adminKeypair,
      mint,
      userTokenAccount,
      adminKeypair,
      totalTokens
    );

    console.log("Initial setup complete");
    console.log(
      "User initial SOL balance:",
      totalTokens / 1_000_000_000,
      "SOL"
    );
  });

  it("Creates a trove manager", async () => {
    // Initialize trove manager
    const tx = await program.methods
      .initTroveManager()
      .accounts({
        signer: adminKeypair.publicKey,
        mint: mint,
        troveManagerAccount: troveManagerPda,
        troveManagerTokenAccount: treasuryPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();

    console.log("-------------- TX:", tx);

    // Verify the trove manager was created
    const troveManagerAccount = await program.account.troveManager.fetch(
      troveManagerPda
    );
    console.log("Trove Manager owner:", troveManagerAccount.owner.toString());
    console.log("Mint address:", troveManagerAccount.mintAddress.toString());
    console.log(
      "Minimum collateral ratio:",
      troveManagerAccount.minimumCollateralRatio.toString(),
      "%"
    );
  });

  it("Opens a trove", async () => {
    const collateral = new anchor.BN(5_000_000_000); // 5 SOL
    const debt = new anchor.BN(500_000_000_000); // 500 solUSD

    // Check user balance before
    const userTokenAccountBefore = await getAccount(
      provider.connection,
      userTokenAccount
    );
    const userSolBefore = Number(userTokenAccountBefore.amount) / 1_000_000_000;

    console.log("BEFORE: No trove exists yet");
    console.log(`        User wallet: ${userSolBefore} SOL | 0 solUSD`);

    // Open trove (init trove)
    const tx = await program.methods
      .initTrove(collateral, debt)
      .accounts({
        signer: userKeypair.publicKey,
        mint: mint,
        troveManagerAccount: troveManagerPda,
        troveManagerTokenAccount: treasuryPda,
        troveAccount: trovePda,
        troveTokenAccount: userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();

    console.log("-------------- TX:", tx);

    // Verify the trove was created
    const troveAccount = await program.account.trove.fetch(trovePda);
    const collateralAfter = troveAccount.collateral.toNumber() / 1_000_000_000;
    const debtAfter = troveAccount.debt.toNumber() / 1_000_000_000;
    const ratioAfter = ((collateralAfter * 200) / debtAfter).toFixed(2);

    // Check user balance after
    const userTokenAccountAfter = await getAccount(
      provider.connection,
      userTokenAccount
    );
    const userSolAfter = Number(userTokenAccountAfter.amount) / 1_000_000_000;

    console.log(
      `AFTER:  Collateral: ${collateralAfter} SOL | Debt: ${debtAfter} solUSD | Ratio: ${ratioAfter}%`
    );
    console.log(
      `        User wallet: ${userSolAfter} SOL | ${debtAfter} solUSD`
    );
  });

  it("Deposits collateral into an existing trove", async () => {
    const depositAmount = 3_000_000_000; // 3 SOL

    // Check trove state before deposit
    const troveAccountBefore = await program.account.trove.fetch(trovePda);
    const collateralBefore =
      troveAccountBefore.collateral.toNumber() / 1_000_000_000;
    const debtBefore = troveAccountBefore.debt.toNumber() / 1_000_000_000;
    const ratioBefore = ((collateralBefore * 200) / debtBefore).toFixed(2);

    // Check user balance before
    const userTokenAccountBefore = await getAccount(
      provider.connection,
      userTokenAccount
    );
    const userSolBefore = Number(userTokenAccountBefore.amount) / 1_000_000_000;

    console.log(
      `BEFORE: Collateral: ${collateralBefore} SOL | Debt: ${debtBefore} solUSD | Ratio: ${ratioBefore}%`
    );
    console.log(
      `        User wallet: ${userSolBefore} SOL | ${debtBefore} solUSD`
    );

    // Now deposit additional collateral
    const tx = await program.methods
      .deposit(new anchor.BN(depositAmount))
      .accounts({
        signer: userKeypair.publicKey,
        mint: mint,
        troveManager: troveManagerPda,
        troveManagerTokenAccount: treasuryPda,
        troveAccount: trovePda,
        troveTokenAccount: userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();

    console.log("-------------- TX:", tx);

    // Verify the collateral was increased
    const troveAccountAfter = await program.account.trove.fetch(trovePda);
    const collateralAfter =
      troveAccountAfter.collateral.toNumber() / 1_000_000_000;
    const debtAfter = troveAccountAfter.debt.toNumber() / 1_000_000_000;
    const ratioAfter = ((collateralAfter * 200) / debtAfter).toFixed(2);

    // Check user balance after
    const userTokenAccountAfter = await getAccount(
      provider.connection,
      userTokenAccount
    );
    const userSolAfter = Number(userTokenAccountAfter.amount) / 1_000_000_000;

    console.log(
      `AFTER:  Collateral: ${collateralAfter} SOL | Debt: ${debtAfter} solUSD | Ratio: ${ratioAfter}%`
    );
    console.log(
      `        User wallet: ${userSolAfter} SOL | ${debtAfter} solUSD`
    );
  });

  it("Withdraws from the trove", async () => {
    const withdrawAmount = 2_000_000_000; // 2 SOL

    // Check trove state before withdrawal
    const troveAccountBefore = await program.account.trove.fetch(trovePda);
    const collateralBefore =
      troveAccountBefore.collateral.toNumber() / 1_000_000_000;
    const debtBefore = troveAccountBefore.debt.toNumber() / 1_000_000_000;
    const ratioBefore = ((collateralBefore * 200) / debtBefore).toFixed(2);

    // Check user balance before
    const userTokenAccountBefore = await getAccount(
      provider.connection,
      userTokenAccount
    );
    const userSolBefore = Number(userTokenAccountBefore.amount) / 1_000_000_000;

    console.log(
      `BEFORE: Collateral: ${collateralBefore} SOL | Debt: ${debtBefore} solUSD | Ratio: ${ratioBefore}%`
    );
    console.log(
      `        User wallet: ${userSolBefore} SOL | ${debtBefore} solUSD`
    );

    const tx = await program.methods
      .withdraw(new anchor.BN(withdrawAmount))
      .accounts({
        signer: userKeypair.publicKey,
        mint: mint,
        troveManager: troveManagerPda,
        troveManagerTokenAccount: treasuryPda,
        troveAccount: trovePda,
        troveTokenAccount: userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();

    console.log("-------------- TX:", tx);

    // Verify the collateral was reduced
    const troveAccountAfter = await program.account.trove.fetch(trovePda);
    const collateralAfter =
      troveAccountAfter.collateral.toNumber() / 1_000_000_000;
    const debtAfter = troveAccountAfter.debt.toNumber() / 1_000_000_000;
    const ratioAfter = ((collateralAfter * 200) / debtAfter).toFixed(2);

    // Check user balance after
    const userTokenAccountAfter = await getAccount(
      provider.connection,
      userTokenAccount
    );
    const userSolAfter = Number(userTokenAccountAfter.amount) / 1_000_000_000;

    console.log(
      `AFTER:  Collateral: ${collateralAfter} SOL | Debt: ${debtAfter} solUSD | Ratio: ${ratioAfter}%`
    );
    console.log(
      `        User wallet: ${userSolAfter} SOL | ${debtAfter} solUSD`
    );
  });

  it("Borrows against collateral in a trove", async () => {
    const borrowAmount = 100_000_000_000; // 100 solUSD additional debt

    // Get initial trove state
    const troveAccountBefore = await program.account.trove.fetch(trovePda);
    const collateralBefore =
      troveAccountBefore.collateral.toNumber() / 1_000_000_000;
    const debtBefore = troveAccountBefore.debt.toNumber() / 1_000_000_000;
    const ratioBefore = ((collateralBefore * 200) / debtBefore).toFixed(2);

    // Check user balance before
    const userTokenAccountBefore = await getAccount(
      provider.connection,
      userTokenAccount
    );
    const userSolBefore = Number(userTokenAccountBefore.amount) / 1_000_000_000;

    console.log(
      `BEFORE: Collateral: ${collateralBefore} SOL | Debt: ${debtBefore} solUSD | Ratio: ${ratioBefore}%`
    );
    console.log(
      `        User wallet: ${userSolBefore} SOL | ${debtBefore} solUSD`
    );

    const tx = await program.methods
      .borrow(new anchor.BN(borrowAmount))
      .accounts({
        signer: userKeypair.publicKey,
        mint: mint,
        troveManager: troveManagerPda,
        troveManagerTokenAccount: treasuryPda,
        troveAccount: trovePda,
        troveTokenAccount: userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();

    console.log("-------------- TX:", tx);

    // Verify the debt was increased
    const troveAccountAfter = await program.account.trove.fetch(trovePda);
    const collateralAfter =
      troveAccountAfter.collateral.toNumber() / 1_000_000_000;
    const debtAfter = troveAccountAfter.debt.toNumber() / 1_000_000_000;
    const ratioAfter = ((collateralAfter * 200) / debtAfter).toFixed(2);

    // Check user balance after
    const userTokenAccountAfter = await getAccount(
      provider.connection,
      userTokenAccount
    );
    const userSolAfter = Number(userTokenAccountAfter.amount) / 1_000_000_000;

    console.log(
      `AFTER:  Collateral: ${collateralAfter} SOL | Debt: ${debtAfter} solUSD | Ratio: ${ratioAfter}%`
    );
    console.log(
      `        User wallet: ${userSolAfter} SOL | ${debtAfter} solUSD`
    );
  });

  it("Repays debt on a trove", async () => {
    const repayAmount = 50_000_000_000; // 50 solUSD repayment

    // Get initial trove state
    const troveAccountBefore = await program.account.trove.fetch(trovePda);
    const collateralBefore =
      troveAccountBefore.collateral.toNumber() / 1_000_000_000;
    const debtBefore = troveAccountBefore.debt.toNumber() / 1_000_000_000;
    const ratioBefore = ((collateralBefore * 200) / debtBefore).toFixed(2);

    // Check user balance before
    const userTokenAccountBefore = await getAccount(
      provider.connection,
      userTokenAccount
    );
    const userSolBefore = Number(userTokenAccountBefore.amount) / 1_000_000_000;

    console.log(
      `BEFORE: Collateral: ${collateralBefore} SOL | Debt: ${debtBefore} solUSD | Ratio: ${ratioBefore}%`
    );
    console.log(
      `        User wallet: ${userSolBefore} SOL | ${debtBefore} solUSD`
    );

    const tx = await program.methods
      .repay(new anchor.BN(repayAmount))
      .accounts({
        signer: userKeypair.publicKey,
        mint: mint,
        troveManager: troveManagerPda,
        troveManagerTokenAccount: treasuryPda,
        troveAccount: trovePda,
        troveTokenAccount: userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();

    console.log("-------------- TX:", tx);

    // Verify the debt was decreased
    const troveAccountAfter = await program.account.trove.fetch(trovePda);
    const collateralAfter =
      troveAccountAfter.collateral.toNumber() / 1_000_000_000;
    const debtAfter = troveAccountAfter.debt.toNumber() / 1_000_000_000;
    const ratioAfter = ((collateralAfter * 200) / debtAfter).toFixed(2);

    // Check user balance after
    const userTokenAccountAfter = await getAccount(
      provider.connection,
      userTokenAccount
    );
    const userSolAfter = Number(userTokenAccountAfter.amount) / 1_000_000_000;

    console.log(
      `AFTER:  Collateral: ${collateralAfter} SOL | Debt: ${debtAfter} solUSD | Ratio: ${ratioAfter}%`
    );
    console.log(
      `        User wallet: ${userSolAfter} SOL | ${debtAfter} solUSD`
    );
  });

  after(async () => {
    console.log("\n=== Test logs will appear above ===");
  });
});
