use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

// use crate::constants::{MAXIMUM_AGE, SOL_USD_FEED_ID};
// use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};

use crate::error::ErrorCode;
use crate::state::*;

pub fn process(ctx: Context<Borrow>, amount: u64) -> Result<()> {
    let trove_manager = &mut ctx.accounts.trove_manager;
    let trove = &mut ctx.accounts.trove_account;

    // let price_update = &mut ctx.accounts.price_update;

    // let sol_feed_id = get_feed_id_from_hex(SOL_USD_FEED_ID)?;
    // let sol_price =
    //     price_update.get_price_no_older_than(&Clock::get()?, MAXIMUM_AGE, &sol_feed_id)?;

    // let total_collateral: u64 = sol_price.price as u64 * trove.collateral;

    let total_collateral: u64 = 200 * trove.collateral;

    let borrowable_amount = total_collateral * 100 / trove_manager.minimum_collateral_ratio;

    if borrowable_amount < amount {
        return Err(ErrorCode::OverBorrowableAmount.into());
    }

    trove_manager.total_debt += amount;
    trove.debt += amount;

    Ok(())
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [mint.key().as_ref()],
        bump,
    )]
    pub trove_manager: Account<'info, TroveManager>,
    #[account(
        mut,
        seeds = [b"treasury", mint.key().as_ref()],
        bump,
    )]
    pub trove_manager_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [signer.key().as_ref()],
        bump,
    )]
    pub trove_account: Account<'info, Trove>,
    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = mint,
        associated_token::authority = signer,
        associated_token::token_program = token_program,
    )]
    pub trove_token_account: InterfaceAccount<'info, TokenAccount>,
    // pub price_update: Account<'info, PriceUpdateV2>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
