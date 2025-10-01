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

  it("Creates a trove manager", async () => {
    // Create admin account and airdrop SOL
    const adminKeypair = Keypair.generate();
    const airdropSignature = await provider.connection.requestAirdrop(
      adminKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Create a mint for the stablecoin
    const mint = await createMint(
      provider.connection,
      adminKeypair,
      adminKeypair.publicKey,
      null,
      9 // 9 decimals
    );

    // Derive trove manager PDA
    const [troveManagerPda] = PublicKey.findProgramAddressSync(
      [mint.toBuffer()],
      program.programId
    );

    // Derive treasury PDA
    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), mint.toBuffer()],
      program.programId
    );

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

    console.log("Trove manager transaction signature:", tx);

    // Verify the trove manager was created
    const troveManagerAccount = await program.account.troveManager.fetch(
      troveManagerPda
    );
    console.log("Trove Manager owner:", troveManagerAccount.owner.toString());
    console.log("Mint address:", troveManagerAccount.mintAddress.toString());
    console.log(
      "Minimum collateral ratio:",
      troveManagerAccount.minimumCollateralRatio.toString()
    );
  });

  it("Opens a trove", async () => {
    // Create admin account and airdrop SOL
    const adminKeypair = Keypair.generate();
    let airdropSignature = await provider.connection.requestAirdrop(
      adminKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Create a mint for the collateral token
    const mint = await createMint(
      provider.connection,
      adminKeypair,
      adminKeypair.publicKey,
      null,
      9 // 9 decimals
    );

    // Derive trove manager PDA
    const [troveManagerPda] = PublicKey.findProgramAddressSync(
      [mint.toBuffer()],
      program.programId
    );

    // Derive treasury PDA
    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), mint.toBuffer()],
      program.programId
    );

    // Initialize trove manager first
    await program.methods
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

    // Create user account and airdrop SOL
    const userKeypair = Keypair.generate();
    airdropSignature = await provider.connection.requestAirdrop(
      userKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Derive trove PDA for user
    const [trovePda] = PublicKey.findProgramAddressSync(
      [userKeypair.publicKey.toBuffer()],
      program.programId
    );

    // Derive user's associated token account
    const userTokenAccount = getAssociatedTokenAddressSync(
      mint,
      userKeypair.publicKey
    );

    // Create user's token account and mint tokens to it
    await createAssociatedTokenAccount(
      provider.connection,
      userKeypair,
      mint,
      userKeypair.publicKey
    );

    const collateral = new anchor.BN(5_000_000_000); // 5 tokens with 9 decimals

    // Mint collateral tokens to user
    await mintTo(
      provider.connection,
      adminKeypair, // mint authority
      mint,
      userTokenAccount,
      adminKeypair, // mint authority
      collateral.toNumber()
    );

    // Open trove (init trove)
    const debt = new anchor.BN(1000);

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

    console.log("Open trove transaction signature:", tx);

    // Verify the trove was created
    const troveAccount = await program.account.trove.fetch(trovePda);
    console.log("Trove collateral:", troveAccount.collateral.toString());
    console.log("Trove debt:", troveAccount.debt.toString());

    // Verify tokens were transferred from user to treasury
    const userTokenAccountInfo = await getAccount(
      provider.connection,
      userTokenAccount
    );
    const treasuryTokenAccountInfo = await getAccount(
      provider.connection,
      treasuryPda
    );

    console.log(
      "User token balance after deposit:",
      userTokenAccountInfo.amount.toString()
    );
    console.log(
      "Treasury token balance after deposit:",
      treasuryTokenAccountInfo.amount.toString()
    );

    // User should have 0 tokens (deposited all 5 tokens)
    // Treasury should have 5 tokens
    if (
      userTokenAccountInfo.amount !== BigInt(0) ||
      treasuryTokenAccountInfo.amount !== BigInt(collateral.toNumber())
    ) {
      throw new Error("Token balances don't match expected values");
    }
  });

  it("Deposits collateral into an existing trove", async () => {
    // Create admin account and airdrop SOL
    const adminKeypair = Keypair.generate();
    let airdropSignature = await provider.connection.requestAirdrop(
      adminKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Create a mint for the collateral token
    const mint = await createMint(
      provider.connection,
      adminKeypair,
      adminKeypair.publicKey,
      null,
      9 // 9 decimals
    );

    // Derive trove manager PDA
    const [troveManagerPda] = PublicKey.findProgramAddressSync(
      [mint.toBuffer()],
      program.programId
    );

    // Derive treasury PDA
    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), mint.toBuffer()],
      program.programId
    );

    // Initialize trove manager first
    await program.methods
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

    // Create user account and airdrop SOL
    const userKeypair = Keypair.generate();
    airdropSignature = await provider.connection.requestAirdrop(
      userKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Derive trove PDA for user
    const [trovePda] = PublicKey.findProgramAddressSync(
      [userKeypair.publicKey.toBuffer()],
      program.programId
    );

    // Derive user's associated token account
    const userTokenAccount = getAssociatedTokenAddressSync(
      mint,
      userKeypair.publicKey
    );

    // Create user's token account and mint tokens to it
    await createAssociatedTokenAccount(
      provider.connection,
      userKeypair,
      mint,
      userKeypair.publicKey
    );

    // First, open a trove with some collateral
    const initialCollateral = 5_000_000_000; // 5 tokens with 9 decimals
    const debt = 1000;

    // Mint initial collateral tokens to user
    await mintTo(
      provider.connection,
      adminKeypair, // mint authority
      mint,
      userTokenAccount,
      adminKeypair, // mint authority
      initialCollateral
    );

    await program.methods
      .initTrove(new anchor.BN(initialCollateral), new anchor.BN(debt))
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

    console.log("Trove opened with collateral:", initialCollateral);

    // Mint additional tokens to user for deposit
    const depositAmount = 3_000_000_000; // 3 tokens with 9 decimals
    await mintTo(
      provider.connection,
      adminKeypair, // mint authority
      mint,
      userTokenAccount,
      adminKeypair, // mint authority
      depositAmount
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

    console.log("Deposit transaction signature:", tx);

    // Verify the collateral was increased
    const troveAccount = await program.account.trove.fetch(trovePda);
    const expectedCollateral = initialCollateral + depositAmount;
    console.log("Expected collateral:", expectedCollateral);
    console.log("Actual collateral:", troveAccount.collateral.toNumber());

    // Verify tokens were transferred from user to treasury
    const userTokenAccountInfo = await getAccount(
      provider.connection,
      userTokenAccount
    );
    const treasuryTokenAccountInfo = await getAccount(
      provider.connection,
      treasuryPda
    );

    console.log(
      "User token balance after deposit:",
      userTokenAccountInfo.amount.toString()
    );
    console.log(
      "Treasury token balance after deposit:",
      treasuryTokenAccountInfo.amount.toString()
    );

    // User should have 0 tokens (deposited all additional tokens)
    // Treasury should have total collateral (8 tokens)
    if (
      userTokenAccountInfo.amount !== BigInt(0) ||
      treasuryTokenAccountInfo.amount !== BigInt(expectedCollateral)
    ) {
      throw new Error("Token balances don't match expected values");
    }
  });

  it("Withdraws from the trove", async () => {
    // Create admin account and airdrop SOL
    const adminKeypair = Keypair.generate();
    let airdropSignature = await provider.connection.requestAirdrop(
      adminKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Create a mint for the collateral token
    const mint = await createMint(
      provider.connection,
      adminKeypair,
      adminKeypair.publicKey,
      null,
      9 // 9 decimals
    );

    // Derive trove manager PDA
    const [troveManagerPda] = PublicKey.findProgramAddressSync(
      [mint.toBuffer()],
      program.programId
    );

    // Derive treasury PDA
    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), mint.toBuffer()],
      program.programId
    );

    // Initialize trove manager first
    await program.methods
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

    // Create user account and airdrop SOL
    const userKeypair = Keypair.generate();
    airdropSignature = await provider.connection.requestAirdrop(
      userKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Derive trove PDA for user
    const [trovePda] = PublicKey.findProgramAddressSync(
      [userKeypair.publicKey.toBuffer()],
      program.programId
    );

    // Derive user's associated token account
    const userTokenAccount = getAssociatedTokenAddressSync(
      mint,
      userKeypair.publicKey
    );

    // Create user's token account and mint tokens to it
    await createAssociatedTokenAccount(
      provider.connection,
      userKeypair,
      mint,
      userKeypair.publicKey
    );

    // First, open a trove with some collateral
    const initialCollateral = 5_000_000_000; // 5 tokens with 9 decimals
    const debt = 1000;

    // Mint collateral tokens to user
    await mintTo(
      provider.connection,
      adminKeypair, // mint authority
      mint,
      userTokenAccount,
      adminKeypair, // mint authority
      initialCollateral
    );

    await program.methods
      .initTrove(new anchor.BN(initialCollateral), new anchor.BN(debt))
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

    console.log("Trove opened with collateral:", initialCollateral);

    // Now withdraw some collateral
    const withdrawAmount = 2_000_000_000; // 2 tokens with 9 decimals

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

    console.log("Withdraw transaction signature:", tx);

    // Verify the collateral was reduced
    const troveAccount = await program.account.trove.fetch(trovePda);
    const expectedCollateral = initialCollateral - withdrawAmount;
    console.log("Expected collateral:", expectedCollateral);
    console.log("Actual collateral:", troveAccount.collateral.toNumber());

    // Verify tokens were transferred from treasury back to user
    const userTokenAccountInfo = await getAccount(
      provider.connection,
      userTokenAccount
    );
    const treasuryTokenAccountInfo = await getAccount(
      provider.connection,
      treasuryPda
    );

    console.log(
      "User token balance after withdrawal:",
      userTokenAccountInfo.amount.toString()
    );
    console.log(
      "Treasury token balance after withdrawal:",
      treasuryTokenAccountInfo.amount.toString()
    );

    // User should have withdrawn amount (2 tokens)
    // Treasury should have remaining collateral (3 tokens)
    if (
      userTokenAccountInfo.amount !== BigInt(withdrawAmount) ||
      treasuryTokenAccountInfo.amount !== BigInt(expectedCollateral)
    ) {
      throw new Error("Token balances don't match expected values");
    }
  });

  it("Borrows against collateral in a trove", async () => {
    // Create admin account and airdrop SOL
    const adminKeypair = Keypair.generate();
    let airdropSignature = await provider.connection.requestAirdrop(
      adminKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Create a mint for the collateral token
    const mint = await createMint(
      provider.connection,
      adminKeypair,
      adminKeypair.publicKey,
      null,
      9 // 9 decimals
    );

    // Derive trove manager PDA
    const [troveManagerPda] = PublicKey.findProgramAddressSync(
      [mint.toBuffer()],
      program.programId
    );

    // Derive treasury PDA
    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), mint.toBuffer()],
      program.programId
    );

    // Initialize trove manager first
    await program.methods
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

    // Create user account and airdrop SOL
    const userKeypair = Keypair.generate();
    airdropSignature = await provider.connection.requestAirdrop(
      userKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Derive trove PDA for user
    const [trovePda] = PublicKey.findProgramAddressSync(
      [userKeypair.publicKey.toBuffer()],
      program.programId
    );

    // Derive user's associated token account
    const userTokenAccount = getAssociatedTokenAddressSync(
      mint,
      userKeypair.publicKey
    );

    // Create user's token account and mint tokens to it
    await createAssociatedTokenAccount(
      provider.connection,
      userKeypair,
      mint,
      userKeypair.publicKey
    );

    // First, open a trove with collateral
    const initialCollateral = 10_000_000_000; // 10 tokens with 9 decimals
    const initialDebt = 1000;

    // Mint collateral tokens to user
    await mintTo(
      provider.connection,
      adminKeypair, // mint authority
      mint,
      userTokenAccount,
      adminKeypair, // mint authority
      initialCollateral
    );

    await program.methods
      .initTrove(new anchor.BN(initialCollateral), new anchor.BN(initialDebt))
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

    console.log("Trove opened with collateral:", initialCollateral);

    // Get initial trove and manager state
    const troveAccountBefore = await program.account.trove.fetch(trovePda);
    const troveManagerBefore = await program.account.troveManager.fetch(
      troveManagerPda
    );

    console.log("Initial trove debt:", troveAccountBefore.debt.toNumber());
    console.log(
      "Initial trove manager total debt:",
      troveManagerBefore.totalDebt.toNumber()
    );

    // Now borrow against the collateral
    const borrowAmount = 5000; // Amount to borrow

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

    console.log("Borrow transaction signature:", tx);

    // Verify the debt was increased
    const troveAccountAfter = await program.account.trove.fetch(trovePda);
    const troveManagerAfter = await program.account.troveManager.fetch(
      troveManagerPda
    );

    const expectedDebt = initialDebt + borrowAmount;
    console.log("Expected debt:", expectedDebt);
    console.log("Actual trove debt:", troveAccountAfter.debt.toNumber());
    console.log(
      "Actual trove manager total debt:",
      troveManagerAfter.totalDebt.toNumber()
    );

    // Verify debt was updated correctly
    if (
      troveAccountAfter.debt.toNumber() !== expectedDebt ||
      troveManagerAfter.totalDebt.toNumber() !== expectedDebt
    ) {
      throw new Error("Debt amounts don't match expected values");
    }

    // Verify collateral remains unchanged
    if (
      troveAccountAfter.collateral.toNumber() !==
      troveAccountBefore.collateral.toNumber()
    ) {
      throw new Error("Collateral should remain unchanged after borrowing");
    }

    console.log("Borrow test passed successfully!");
  });

  it("Repays debt on a trove", async () => {
    // Create admin account and airdrop SOL
    const adminKeypair = Keypair.generate();
    let airdropSignature = await provider.connection.requestAirdrop(
      adminKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Create a mint for the collateral token
    const mint = await createMint(
      provider.connection,
      adminKeypair,
      adminKeypair.publicKey,
      null,
      9 // 9 decimals
    );

    // Derive trove manager PDA
    const [troveManagerPda] = PublicKey.findProgramAddressSync(
      [mint.toBuffer()],
      program.programId
    );

    // Derive treasury PDA
    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), mint.toBuffer()],
      program.programId
    );

    // Initialize trove manager first
    await program.methods
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

    // Create user account and airdrop SOL
    const userKeypair = Keypair.generate();
    airdropSignature = await provider.connection.requestAirdrop(
      userKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Derive trove PDA for user
    const [trovePda] = PublicKey.findProgramAddressSync(
      [userKeypair.publicKey.toBuffer()],
      program.programId
    );

    // Derive user's associated token account
    const userTokenAccount = getAssociatedTokenAddressSync(
      mint,
      userKeypair.publicKey
    );

    // Create user's token account and mint tokens to it
    await createAssociatedTokenAccount(
      provider.connection,
      userKeypair,
      mint,
      userKeypair.publicKey
    );

    // First, open a trove with collateral and some initial debt
    const initialCollateral = 10_000_000_000; // 10 tokens with 9 decimals
    const initialDebt = 5000;

    // Mint collateral tokens to user
    await mintTo(
      provider.connection,
      adminKeypair, // mint authority
      mint,
      userTokenAccount,
      adminKeypair, // mint authority
      initialCollateral
    );

    await program.methods
      .initTrove(new anchor.BN(initialCollateral), new anchor.BN(initialDebt))
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

    console.log("Trove opened with debt:", initialDebt);

    // Get initial trove and manager state
    const troveAccountBefore = await program.account.trove.fetch(trovePda);
    const troveManagerBefore = await program.account.troveManager.fetch(
      troveManagerPda
    );

    console.log("Initial trove debt:", troveAccountBefore.debt.toNumber());
    console.log(
      "Initial trove manager total debt:",
      troveManagerBefore.totalDebt.toNumber()
    );

    // Now repay some of the debt
    const repayAmount = 2000; // Amount to repay

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

    console.log("Repay transaction signature:", tx);

    // Verify the debt was decreased
    const troveAccountAfter = await program.account.trove.fetch(trovePda);
    const troveManagerAfter = await program.account.troveManager.fetch(
      troveManagerPda
    );

    const expectedDebt = initialDebt - repayAmount;
    console.log("Expected debt:", expectedDebt);
    console.log("Actual trove debt:", troveAccountAfter.debt.toNumber());
    console.log(
      "Actual trove manager total debt:",
      troveManagerAfter.totalDebt.toNumber()
    );

    // Verify debt was updated correctly
    if (
      troveAccountAfter.debt.toNumber() !== expectedDebt ||
      troveManagerAfter.totalDebt.toNumber() !== expectedDebt
    ) {
      throw new Error("Debt amounts don't match expected values");
    }

    // Verify collateral remains unchanged
    if (
      troveAccountAfter.collateral.toNumber() !==
      troveAccountBefore.collateral.toNumber()
    ) {
      throw new Error("Collateral should remain unchanged after repayment");
    }

    console.log("Repay test passed successfully!");
  });

  after(async () => {
    console.log("\n=== Test logs will appear above ===");
  });
});
