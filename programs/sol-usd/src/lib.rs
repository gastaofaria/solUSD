use anchor_lang::prelude::*;

declare_id!("2m9aAjnY5x8QjK3r6vebqgUihbVYDgxRLRvtmEwn7WcV");

#[program]
pub mod sol_usd {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
