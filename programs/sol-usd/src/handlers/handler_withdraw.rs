use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{ self, Mint, TokenAccount, TokenInterface, TransferChecked };
use crate::state::*;
use crate::error::ErrorCode;

pub fn process(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let trove: &mut Account<'_, Trove> = &mut ctx.accounts.trove_account;

    msg!("INITIAL Collateral: {}", trove.collateral);

    let deposited_value = trove.collateral;

    if deposited_value < amount {
        return Err(ErrorCode::InsufficientFunds.into());
    }

    let transfer_cpi_accounts = TransferChecked {
        from: ctx.accounts.trove_manager_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.trove_token_account.to_account_info(),
        authority: ctx.accounts.trove_manager_token_account.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.to_account_info();
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] = &[
        &[
            b"treasury",
            mint_key.as_ref(),
            &[ctx.bumps.trove_manager_token_account],
        ],
    ];
    let cpi_ctx = CpiContext::new(cpi_program, transfer_cpi_accounts).with_signer(signer_seeds);

    let decimals = ctx.accounts.mint.decimals;

    token_interface::transfer_checked(cpi_ctx, amount, decimals)?;

    let trove_manager = &mut ctx.accounts.trove_manager;

    trove.collateral -= amount;
    trove_manager.total_collateral -= amount;

    msg!("FINAL Collateral: {}", trove.collateral);

    Ok(())
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
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
