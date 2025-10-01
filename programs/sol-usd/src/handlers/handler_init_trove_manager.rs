use anchor_lang::{prelude::*, Accounts};
use crate::state::*;
use anchor_spl::token_interface::{ Mint, TokenAccount, TokenInterface };

pub fn process(ctx: Context<InitTroveManager>) -> Result <()> {
  let trove_manager: &mut Account<'_, TroveManager> = &mut ctx.accounts.trove_manager_account;

  trove_manager.owner = ctx.accounts.signer.key();
  trove_manager.mint_address = ctx.accounts.mint.key();

  trove_manager.total_collateral = 0;
  trove_manager.total_debt = 0;
  trove_manager.total_stakes = 0;
  trove_manager.is_recovery_mode = false;

  trove_manager.minimum_collateral_ratio = 110;
  trove_manager.critical_collateral_ratio = 150;
  trove_manager.minimum_debt = 1000;
  trove_manager.fee = 1;

  msg!("Trove Manager created");

  Ok(())
}

#[derive(Accounts)]
pub struct InitTroveManager<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init, 
        space = 8 + TroveManager::INIT_SPACE, 
        payer = signer,
        seeds = [mint.key().as_ref()],
        bump, 
    )]
    pub trove_manager_account: Account<'info, TroveManager>,
    #[account(
        init, 
        token::mint = mint, 
        token::authority = trove_manager_token_account,
        payer = signer,
        seeds = [b"treasury", mint.key().as_ref()],
        bump,
    )]
    pub trove_manager_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>, 
    pub system_program: Program <'info, System>,
}
