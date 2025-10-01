use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{ Mint, TokenAccount, TokenInterface };
use crate::state::*;
use crate::error::ErrorCode;

pub fn process(ctx: Context<Repay>, amount: u64) -> Result<()> {
    let trove = &mut ctx.accounts.trove_account;

    let debt = trove.debt;

    if amount > debt {
        return Err(ErrorCode::OverRepay.into());
    }

    let trove_manager = &mut ctx.accounts.trove_manager;
    
    trove.debt -= amount;
    trove_manager.total_debt -= amount;

    Ok(())
}

#[derive(Accounts)]
pub struct Repay<'info> {
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
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
