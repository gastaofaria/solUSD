use crate::state::*;
use anchor_lang::{prelude::*, Accounts};

pub fn process(ctx: Context<WithdrawCollateral>, collateral: u64) -> Result<()> {
    let trove: &mut Account<'_, Trove> = &mut ctx.accounts.trove_account;

    msg!("INITIAL Collateral: {}", trove.collateral);

    if trove.collateral >= collateral {
        trove.collateral = trove.collateral - collateral;
    }

    msg!("FINAL Collateral: {}", trove.collateral);

    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [signer.key().as_ref()],
        bump,
    )]
    pub trove_account: Account<'info, Trove>,
    pub system_program: Program<'info, System>,
}
