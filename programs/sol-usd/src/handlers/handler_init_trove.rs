use anchor_lang::{prelude::*, Accounts};
use crate::state::*;
use anchor_spl::token_interface::{ self, Mint, TokenAccount, TokenInterface, TransferChecked };
use anchor_spl::associated_token::AssociatedToken;

pub fn process(ctx: Context<InitTrove>, collateral: u64, debt: u64) -> Result <()> {
    let transfer_cpi_accounts = TransferChecked {
        from: ctx.accounts.trove_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.trove_manager_token_account.to_account_info(),
        authority: ctx.accounts.signer.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, transfer_cpi_accounts);
    let decimals = ctx.accounts.mint.decimals;

    token_interface::transfer_checked(cpi_ctx, collateral, decimals)?;

    let trove_manager = &mut ctx.accounts.trove_manager_account;
    let trove = &mut ctx.accounts.trove_account;

    trove.collateral = collateral;
    trove.debt = debt;
    trove.owner = ctx.accounts.signer.key();

    trove_manager.total_collateral += collateral;
    trove_manager.total_debt += debt;

    Ok(())
}

#[derive(Accounts)]
pub struct InitTrove<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [mint.key().as_ref()],
        bump,
    )]
    pub trove_manager_account: Account<'info, TroveManager>,
    #[account(
      mut,
      seeds = [b"treasury", mint.key().as_ref()],
      bump,
    )]  
    pub trove_manager_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
      init,
      payer = signer,
      space = 8 + Trove::INIT_SPACE,
      seeds = [signer.key().as_ref()],
      bump,
    )]
    pub trove_account: Account<'info, Trove>,
    #[account( 
      mut,
      associated_token::mint = mint,
      associated_token::authority = signer,
      associated_token::token_program = token_program,
    )]
    pub trove_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
