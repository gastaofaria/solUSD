use anchor_lang::prelude::*;
use handlers::*;

mod constants;
mod error;
mod handlers;
mod state;

declare_id!("2m9aAjnY5x8QjK3r6vebqgUihbVYDgxRLRvtmEwn7WcV");

#[program]
pub mod sol_usd {
    use super::*;

    pub fn init_trove_manager(ctx: Context<InitTroveManager>) -> Result<()> {
        handler_init_trove_manager::process(ctx)
    }

    pub fn init_trove(ctx: Context<InitTrove>, collateral: u64, debt: u64) -> Result<()> {
        handler_init_trove::process(ctx, collateral, debt)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        handler_withdraw::process(ctx, amount)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        handler_deposit::process(ctx, amount)
    }

    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        handler_borrow::process(ctx, amount)
    }

    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        handler_repay::process(ctx, amount)
    }
}
