export const testMetadata = `{
  "title": "Test",
  "authors": ["Test Author"],
  "summary": "This is a test proposal.",
  "details": "This is a test proposal.",
  "proposal_forum_url": "https://forum.polygon.technology/test",
  "vote_option_context": "This is a test proposal."
}`

export const testProposal = `{
  "metadata": "ipfs://test",
  "deposit": "100000000000000000000pol",
  "title": "Test",
  "summary": "This is a test proposal.",
  "expedited": false
}`

// Expedited text proposal
export const expeditedMetadata = `{
  "title": "Expedited Test",
  "authors": ["Test Author"],
  "summary": "This is an expedited test proposal.",
  "details": "This is an expedited test proposal.",
  "proposal_forum_url": "https://forum.polygon.technology/expedited-test",
  "vote_option_context": "Expedited deposit: 500 POL"
}`

export const expeditedProposal = `{
  "metadata": "ipfs://test-expedited",
  "deposit": "100000000000000000000pol",
  "title": "Expedited Test",
  "summary": "This is an expedited test proposal.",
  "expedited": true
}`

// gov.MsgUpdateParams proposal
export const updateGovParamsMetadata = `{
  "title": "Change voting period.",
  "authors": ["Test Author"],
  "summary": "Change voting period.",
  "details": "Change voting period.",
  "proposal_forum_url": "https://forum.polygon.technology/test",
  "vote_option_context": "This is a test proposal to change the voting period."
}`

export const updateGovParamsProposal = `{
  "messages": [
    {
      "@type": "/cosmos.gov.v1.MsgUpdateParams",
      "authority": "0x7b5fe22b5446f7c62ea27b8bd71cef94e03f3df2",
      "params": {
        "min_deposit": [{ "amount": "100000000000000000000", "denom": "pol" }],
        "max_deposit_period": "172800s",
        "voting_period": "75s",
        "quorum": "0.334000000000000000",
        "threshold": "0.500000000000000000",
        "veto_threshold": "0.334000000000000000",
        "min_initial_deposit_ratio": "0.000000000000000000",
        "proposal_cancel_ratio": "0.500000000000000000",
        "proposal_cancel_dest": "",
        "expedited_voting_period": "50s",
        "expedited_threshold": "0.667000000000000000",
        "expedited_min_deposit": [
          { "amount": "500000000000000000000", "denom": "pol" }
        ],
        "burn_vote_quorum": false,
        "burn_proposal_deposit_prevote": false,
        "burn_vote_veto": true,
        "min_deposit_ratio": "0.010000000000000000"
      }
    }
  ],
  "metadata": "ipfs://CID",
  "deposit": "1000000000000000000pol",
  "title": "Change voting period to 75 secs.",
  "summary": "Change voting period to 75 secs.",
  "expedited": false
}`

// JSON content for auth.MsgUpdateParams proposal
export const updateAuthParamsMetadata = `{
  "title": "Test Proposal.",
  "authors": ["Test Author"],
  "summary": "Test Proposal",
  "details": "Test Proposal",
  "proposal_forum_url": "https://forum.polygon.technology/test",
  "vote_option_context": "This is a test proposal to change the auth params."
}`

export const updateAuthParamsProposal = `{
  "messages": [
    {
      "@type": "/cosmos.auth.v1beta1.MsgUpdateParams",
      "authority": "0x7b5fe22b5446f7c62ea27b8bd71cef94e03f3df2",
      "params": {
        "max_memo_characters": "512",
        "tx_sig_limit": "1",
        "tx_size_cost_per_byte": "20",
        "sig_verify_cost_ed25519": "600",
        "sig_verify_cost_secp256k1": "1100",
        "max_tx_gas": "10000000",
        "tx_fees": "10000000000000000"
      }
    }
  ],
  "metadata": "ipfs://test",
  "deposit": "1000000000000000000pol",
  "title": "Change auth params.",
  "summary": "Change auth params.",
  "expedited": false
}`
