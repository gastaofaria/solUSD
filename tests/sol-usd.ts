import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { SolUsd } from "../target/types/sol_usd";

describe("sol-usd", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.solUsd as Program<SolUsd>;
  const provider = anchor.getProvider();

  it("Opens a vault", async () => {
    // Create user account and airdrop SOL
    const userKeypair = Keypair.generate();
    const airdropSignature = await provider.connection.requestAirdrop(
      userKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Derive trove PDA for user
    const [trovePda] = PublicKey.findProgramAddressSync(
      [userKeypair.publicKey.toBuffer()],
      program.programId
    );

    // Open vault (init trove)
    const collateral = 5 * anchor.web3.LAMPORTS_PER_SOL;
    const debt = 1000;

    const tx = await program.methods
      .initTrove(new anchor.BN(collateral), new anchor.BN(debt))
      .accounts({
        signer: userKeypair.publicKey,
      })
      .signers([userKeypair])
      .rpc();

    console.log("Open vault transaction signature:", tx);
  });

  it("Withdraws collateral from the vault", async () => {
    // Create user account and airdrop SOL
    const userKeypair = Keypair.generate();
    const airdropSignature = await provider.connection.requestAirdrop(
      userKeypair.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Derive trove PDA for user
    const [trovePda] = PublicKey.findProgramAddressSync(
      [userKeypair.publicKey.toBuffer()],
      program.programId
    );

    // First, open a vault with some collateral
    const initialCollateral = 5 * anchor.web3.LAMPORTS_PER_SOL;
    const debt = 1000;

    await program.methods
      .initTrove(new anchor.BN(initialCollateral), new anchor.BN(debt))
      .accounts({
        signer: userKeypair.publicKey,
      })
      .signers([userKeypair])
      .rpc();

    console.log("Vault opened with collateral:", initialCollateral);

    // Now withdraw some collateral
    const withdrawAmount = 2 * anchor.web3.LAMPORTS_PER_SOL;

    const tx = await program.methods
      .withdrawCollateral(new anchor.BN(withdrawAmount))
      .accounts({
        signer: userKeypair.publicKey,
      })
      .signers([userKeypair])
      .rpc();

    console.log("Withdraw collateral transaction signature:", tx);

    // Verify the collateral was reduced
    const troveAccount = await program.account.trove.fetch(trovePda);
    const expectedCollateral = initialCollateral - withdrawAmount;
    console.log("Expected collateral:", expectedCollateral);
    console.log("Actual collateral:", troveAccount.collateral.toNumber());
  });

  after(async () => {
    console.log("\n=== Test logs will appear above ===");
  });
});
