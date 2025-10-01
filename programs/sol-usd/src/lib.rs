use anchor_lang::prelude::*;
use handlers::*;

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

    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, collateral: u64) -> Result<()> {
        handler_withdraw_collateral::process(ctx, collateral)
    }
}
