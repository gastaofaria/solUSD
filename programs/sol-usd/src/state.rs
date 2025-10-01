use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Trove {
    pub owner: Pubkey,
    pub collateral: u64,
    pub debt: u64,
    pub stake: u64,
}

#[account]
#[derive(InitSpace)]
pub struct TroveManager {
    pub mint_address: Pubkey,

    pub total_collateral: u64,
    pub total_debt: u64,
    pub total_stakes: u64,
    pub is_recovery_mode: bool,

    pub minimum_collateral_ratio: u64,
    pub critical_collateral_ratio: u64,
    pub minimum_debt: u64,
    pub fee: u64,
}
