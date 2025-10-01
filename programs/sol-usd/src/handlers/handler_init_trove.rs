use anchor_lang::{prelude::*, Accounts};
use crate::state::*;
// use anchor_spl::token_interface::{ Mint, TokenAccount, TokenInterface };

pub fn process(ctx: Context<InitTrove>, collateral: u64, debt: u64) -> Result <()> {
  let trove: &mut Account<'_, Trove> = &mut ctx.accounts.trove_account;

  trove.owner = ctx.accounts.signer.key();
  trove.collateral = collateral;
  trove.debt = debt;

  msg!("Collateral: {}, Debt: {}", collateral, debt);

  Ok(())
}

#[derive(Accounts)]
pub struct InitTrove<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    // pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = signer, 
        space = 8 + Trove::INIT_SPACE,
        seeds = [signer.key().as_ref()],
        bump,
    )]
    pub trove_account: Account<'info, Trove>,
    // #[account(
    //   init, 
    //   token::mint = mint, 
    //   token::authority = trove_token_account,
    //   payer = signer,
    //   seeds = [b"treasury", mint.key().as_ref()],
    //   bump,
    // )]
    // pub trove_token_account: InterfaceAccount<'info, TokenAccount>,
    // pub token_program: Interface<'info, TokenInterface>, 
    pub system_program: Program <'info, System>,

}