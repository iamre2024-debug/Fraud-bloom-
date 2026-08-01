import {
  CUSTOMER_TYPES,
  FINAL_FINDINGS,
  PRODUCT_TYPES,
  SUSPECTED_PATTERNS,
  WORKFLOW_TYPES,
} from './caseDomain.js';

function entry(subtype, title, statement, amount, transactionInfo, correctDetermination, truth, options = {}) {
  return {
    subtype,
    title,
    statement,
    amount,
    transactionInfo,
    correctDetermination,
    truth,
    ...options,
  };
}

const scenarioCatalog = {
  'account-takeover': [
    entry('credential stuffing', 'Credential stuffing and transfer review', 'I received login alerts overnight and do not recognize the purchase that followed.', '$1,286.40', 'Electronics marketplace purchase - card not present - training card ending 2641', 'Support Customer Claim', 'Reused credentials were tested from a new device before an unauthorized purchase.', { priority: 'High' }),
    entry('phishing', 'New wallet and account access review', 'I received a message about my account, signed in, and later saw activity I do not recognize.', '$742.18', 'Digital marketplace purchase - card not present - training card ending 2209', 'Support Customer Claim', 'A look-alike sign-in page captured credentials and was followed by new wallet activity.', { id: 'ato-phishing-wallet', priority: 'High' }),
    entry('OTP phishing', 'One-time-code and payee review', 'A caller asked me to read back a code, and a new payee appeared shortly afterward.', '$2,180.00', 'External transfer - newly added payee - training account ending 1176', 'Support Customer Claim', 'The customer disclosed an OTP that was used to add a new payee and release a transfer.', { priority: 'High' }),
    entry('vishing', 'Phone impersonation and account-control review', 'Someone claiming to be the bank called about fraud and told me to move money to protect it.', '$3,420.00', 'Customer-initiated transfer - new destination - training account ending 6830', 'Escalate Investigation', 'The customer authorized the payment under deception, requiring an escalation rather than an automatic unauthorized-activity outcome.', { priority: 'High' }),
    entry('SIM swap', 'SIM change and mobile access review', 'My phone lost service before I received alerts about account changes and a transfer.', '$4,075.00', 'Mobile transfer - new external destination - training account ending 9422', 'Support Customer Claim', 'A carrier SIM change preceded password recovery, profile control, and money movement.', { priority: 'Critical' }),
    entry('remote access malware', 'Remote access and payment-session review', 'A caller asked me to install support software and then moved through my account while the screen was shared.', '$6,240.00', 'Online transfer - remote access session - training account ending 1442', 'Escalate Investigation', 'Remote access software was present during a customer-authenticated session and the payment authorization requires a coached-transfer review.', { priority: 'Critical' }),
    entry('help desk reset abuse', 'Help desk recovery and profile-control review', 'I did not contact support, but my password and phone were reset through the help desk.', '$3,860.00', 'External transfer - help desk reset sequence - training account ending 5381', 'Support Customer Claim', 'An impersonator bypassed recovery controls before changing contact details and releasing a transfer.', { priority: 'Critical' }),
    entry('session hijack', 'Session and profile access review', 'I noticed a card transaction after checking my account from my regular phone.', '$486.22', 'Online retail purchase - card not present - training card ending 5106', 'Insufficient Evidence', 'The known device and session contain mixed signals, and the packet lacks enough proof to attribute the purchase.', { id: 'ato-session-control', priority: 'High' }),
    entry('profile change before transfer', 'Profile-control change and transfer review', 'My phone and email were changed shortly before money left the account.', '$5,120.00', 'Online transfer - profile change sequence - training account ending 4802', 'Support Customer Claim', 'A new session changed recovery details immediately before adding and paying a new destination.', { priority: 'Critical' }),
    entry('new payee/external account add', 'New external payee and transfer review', 'I do not recognize the new external account or the transfer sent to it.', '$2,975.00', 'External transfer - newly added destination - training account ending 3076', 'Support Customer Claim', 'The destination was first seen during an unfamiliar session and had no prior customer relationship.', { priority: 'High' }),
    entry('wallet enrollment after takeover', 'Post-takeover wallet enrollment review', 'A wallet was added after my password was reset, and I do not recognize the purchases.', '$1,046.80', 'Digital wallet purchases - new token enrollment - training card ending 8193', 'Support Customer Claim', 'Unfamiliar recovery activity preceded a new wallet token and rapid purchases.', { priority: 'Critical' }),
  ],
  'fraud-chargeback': [
    entry('lost card', 'Lost card and point-of-sale review', 'I lost my card during the afternoon and do not recognize the store purchase made later.', '$286.47', 'Urban Market purchase - contactless POS - training card ending 3702', 'Support Customer Claim', 'The purchase occurred after the documented loss and before the card was blocked.', { priority: 'High' }),
    entry('stolen card', 'Stolen card and chip activity review', 'My wallet was stolen, but I do not recognize the chip purchase made that evening.', '$914.36', 'Harbor Electronics purchase - EMV chip - training card ending 6184', 'Insufficient Evidence', 'The chip record is strong authorization evidence, but PIN and card-possession timing remain unresolved.', { priority: 'High' }),
    entry('never received card', 'Card delivery and activation review', 'I never received the replacement card and did not activate or use it.', '$438.19', 'Parkline Department Store - contactless POS - training card ending 0268', 'Support Customer Claim', 'Carrier and activation records do not connect the card to the cardholder before the disputed purchase.', { priority: 'High' }),
    entry('counterfeit/skimming', 'Counterfeit card and magnetic-stripe review', 'I still had my card when cash withdrawals and store purchases appeared in another city.', '$1,120.00', 'ATM and retail activity - magnetic stripe - training card ending 5527', 'Support Customer Claim', 'Fallback magnetic-stripe activity occurred far from the cardholder while the physical card remained in possession.', { priority: 'Critical' }),
    entry('CNP fraud', 'Unrecognized online card purchase', 'I do not recognize this online purchase and still have my physical card.', '$328.64', 'Northstar Digital Market - card not present - training card ending 4410', 'Support Customer Claim', 'The order used a new device, mismatched delivery details, and no established merchant account.', { id: 'fcb-cnp-purchase', priority: 'High' }),
    entry('digital wallet token fraud', 'Digital wallet card activity review', 'I saw a card transaction after an alert about a wallet I did not add.', '$512.09', 'Metro Mobile Wallet Merchant - tokenized card payment - training card ending 7734', 'Do Not Support Customer Claim', 'The wallet token was provisioned on the known phone and a chip purchase by the same cardholder occurred during the claimed fraud window.', { id: 'fcb-wallet-token', priority: 'High' }),
    entry('ATM/POS fraud', 'ATM cash and PIN review', 'I do not recognize the cash withdrawal and still have my debit card.', '$680.00', 'Training Federal ATM - chip and PIN - training card ending 9043', 'Do Not Support Customer Claim', 'The ATM used the chip and correct PIN near the cardholder home immediately after a recognized balance inquiry.', { priority: 'High' }),
    entry('unauthorized online purchase', 'Online authorization and fulfillment review', 'I did not make this online order and do not know the shipping address.', '$764.28', 'BrightCart Online - ecommerce purchase - training card ending 1935', 'Partial Credit', 'One item was delivered to the customer address while a second shipment went to an unrelated address.', { priority: 'High' }),
  ],
  'non-fraud-chargeback': [
    entry('incorrect amount', 'Incorrect merchant amount review', 'My receipt shows a smaller total than the amount posted to my card.', '$486.20', 'Cedar Table Restaurant - card present - training card ending 1018', 'Support Customer Claim', 'The signed receipt and authorization record support a lower amount than the posted transaction.'),
    entry('duplicate billing', 'Duplicate merchant billing review', 'I believe I was billed twice for the same purchase.', '$214.89', 'Cedar Square Outfitters - two posted card payments - training card ending 7712', 'Support Customer Claim', 'Two settled transactions share the same order, amount, and fulfillment record.', { id: 'ncb-duplicate-billing' }),
    entry('refund not received', 'Promised refund review', 'The merchant confirmed a refund, but it has not appeared on my account.', '$342.70', 'Riverbend Home Goods - refund pending - training card ending 2274', 'Support Customer Claim', 'The merchant issued a credit confirmation but no matching network credit posted by the expected date.'),
    entry('canceled service billed', 'Recurring billing after cancellation', 'I canceled the service and continued to see the same charge on my statement.', '$189.44', 'StreamBox Premium - recurring card payment - training card ending 8841', 'Insufficient Evidence', 'Recurring billing continued, but the customer and merchant records show different cancellation dates.', { id: 'ncb-recurring-cancellation' }),
    entry('item not as described', 'Merchandise quality and return review', 'The product was materially different from the listing, and the merchant declined my return.', '$629.95', 'Juniper Tech Outlet - ecommerce purchase - training card ending 4530', 'Partial Credit', 'The listing mismatch is documented, but the customer retained one component of the order.'),
    entry('services not rendered', 'Unprovided service review', 'I paid a deposit, but the scheduled service was never performed.', '$1,450.00', 'Lakeside Event Services - card payment - training card ending 6649', 'Support Customer Claim', 'The appointment was canceled by the merchant and no rescheduled service or credit was provided.', { priority: 'High' }),
    entry('return credit not posted', 'Return tracking and credit review', 'Tracking shows the return arrived, but I have not received the merchant credit.', '$278.16', 'Northline Apparel - returned merchandise - training card ending 8420', 'Support Customer Claim', 'Carrier delivery and warehouse intake records show the returned item was received.'),
    entry('subscription terms dispute', 'Subscription enrollment and terms review', 'I did not understand that the trial would convert to an annual subscription.', '$119.99', 'Planwell Learning - annual subscription - training card ending 3916', 'Do Not Support Customer Claim', 'Checkout and reminder records show the renewal price and cancellation window were disclosed and acknowledged.'),
  ],
  'first-party-fraud': [
    entry('friendly fraud', 'Recognized household purchase dispute', 'I do not remember making this purchase and want it removed.', '$384.52', 'Oakline Games - digital purchase - training card ending 0087', 'Do Not Support Customer Claim', 'The purchase was made from the established household device and the digital content was used.'),
    entry('household member use', 'Household authorized-user review', 'No one in my household was supposed to use my saved card for this order.', '$246.18', 'Family Market Online - saved card purchase - training card ending 6215', 'Do Not Support Customer Claim', 'An established authorized user placed the order and it was delivered to the account address.'),
    entry('digital goods used', 'Digital goods activation review', 'I did not receive anything for this charge.', '$159.00', 'ArcadeCloud Digital - digital goods - training card ending 1054', 'Do Not Support Customer Claim', 'The digital license was activated and used from the customer device before the dispute.'),
    entry('delivery proof conflicts with claim', 'Delivery and prior claim review', 'I did not receive the item and want the transaction reviewed.', '$638.40', 'Cedar Parcel Market - shipped order - training card ending 9088', 'Do Not Support Customer Claim', 'Carrier GPS, delivery photo, and signature connect the parcel to the customer address.', { id: 'fpf-delivery-review' }),
    entry('repeated non-receipt pattern', 'Repeated non-receipt pattern review', 'Several recent packages did not reach me even though the merchants marked them delivered.', '$872.33', 'Multiple online merchants - delivery disputes - training card ending 2148', 'Escalate Investigation', 'The repeated pattern requires secondary review, but individual delivery records are mixed.'),
    entry('refund/return abuse', 'Refund and retained merchandise review', 'I returned the order and should not still be charged.', '$517.64', 'Northstar Home - return request - training card ending 7341', 'Do Not Support Customer Claim', 'Only an empty parcel was received while account activity shows continued product use.'),
    entry('dispute after usage', 'Service usage after dispute review', 'I canceled because the service did not work for me.', '$229.00', 'FitTrack Annual - subscription service - training card ending 4473', 'Insufficient Evidence', 'Usage continued for part of the disputed period, but later access ended before the full billed term.'),
  ],
  'payroll-direct-deposit': [
    entry('spoofed employee email', 'Spoofed employee payroll request', 'Payroll received an email that looked like mine, but I did not request a new deposit account.', '$2,860.00', 'Payroll destination update - email request - training destination ending 0042', 'Hold', 'A look-alike sender requested a new destination that could not be verified with the employee.', { priority: 'High' }),
    entry('compromised employee email', 'Compromised mailbox payroll change', 'A real email thread from my account included a bank change I did not send.', '$3,140.00', 'Payroll destination update - compromised mailbox - training destination ending 7036', 'Hold', 'Mailbox access and forwarding activity preceded a payroll destination change.', { priority: 'Critical' }),
    entry('fake new-hire payroll setup', 'New-hire payroll profile review', 'A newly added employee is scheduled for payroll, but the manager cannot confirm the hiring packet.', '$1,980.00', 'New employee payroll setup - first pay cycle - training destination ending 1174', 'Hold', 'The employee record, manager approval, and identity documents do not connect across sources.', { priority: 'High' }),
    entry('payroll admin portal compromise', 'Payroll portal access review', 'A destination was changed through the payroll portal outside our normal processing window.', '$4,620.00', 'Payroll portal change - off-hours session - training destination ending 6098', 'Hold', 'A new device and IP performed the change after administrator credentials were reused.', { priority: 'Critical' }),
    entry('existing employee destination changed', 'Employee direct deposit change review', 'I received a notice that my pay destination changed, but I did not submit a new form.', '$2,860.00', 'Payroll destination update - employee direct deposit - training destination ending 0042', 'Hold', 'The destination is new, ownership does not match, and the employee denied the change.', { id: 'pay-direct-deposit-change', priority: 'High' }),
    entry('payroll card diversion', 'Payroll card destination review', 'My wages were sent to a payroll card I did not request.', '$1,742.00', 'Payroll card enrollment - first use - training card ending 2851', 'Hold', 'The payroll card enrollment lacks employee consent and used an unrelated contact channel.', { priority: 'High' }),
    entry('ghost employee payroll', 'Ghost employee roster review', 'A payroll entry appears for someone our department does not recognize.', '$6,800.00', 'Payroll roster entry - repeated payments - training destination ending 4017', 'Escalate Investigation', 'The employee lacks manager, HR, timekeeping, and identity support across multiple pay periods.', { priority: 'Critical' }),
  ],
  'email-bec': [
    entry('vendor bank change', 'Vendor payment instruction review', 'The payment instruction looked like it came from our vendor, but the destination details were different.', '$8,450.00', 'Vendor payment instruction - external destination update - training destination ending 8412', 'Hold', 'The requested destination is new and the trusted vendor contact denied the change.', { id: 'bec-vendor-change', priority: 'High' }),
    entry('look-alike domain', 'Look-alike vendor domain review', 'The invoice email looked normal, but the sender domain has one character changed.', '$14,860.00', 'Vendor invoice instruction - new beneficiary - training destination ending 4832', 'Hold', 'A newly registered look-alike domain supplied replacement payment instructions.', { priority: 'Critical' }),
    entry('mailbox compromise', 'Vendor mailbox compromise review', 'The message came from the vendor mailbox, but the vendor says the new bank details are not theirs.', '$28,450.00', 'Vendor payment instruction - mailbox thread - training destination ending 6620', 'Hold', 'Mailbox access and forwarding rules were used to alter an established invoice thread.', { priority: 'Critical' }),
    entry('CEO urgent payment', 'Executive urgent-payment review', 'An executive asked for an urgent confidential payment outside our regular approval process.', '$42,600.00', 'Executive payment request - urgent wire - training destination ending 8804', 'Hold', 'The message used executive impersonation and bypassed the approved payment workflow.', { priority: 'Critical' }),
    entry('invoice diversion', 'Invoice beneficiary diversion review', 'The invoice details changed just before payment, and the vendor cannot confirm the account.', '$19,735.00', 'Invoice payment - changed beneficiary - training destination ending 9061', 'Hold', 'A valid invoice was altered to route payment to an unrelated beneficiary.', { priority: 'Critical' }),
    entry('reply-to mismatch', 'Reply-to and sender comparison', 'The display name and sender looked familiar, but replies were going to a different address.', '$7,920.00', 'Supplier payment instruction - reply-to mismatch - training destination ending 3507', 'More Information Needed', 'The reply-to mismatch is material, but trusted callback and beneficiary ownership records are still pending.', { priority: 'High' }),
    entry('mailbox rule forwarding', 'Mailbox forwarding rule review', 'A payment conversation was copied to an address our team does not recognize.', '$11,280.00', 'Accounts payable email - forwarding rule - training destination ending 1279', 'Hold', 'A hidden forwarding rule exposed and redirected the payment conversation.', { priority: 'High' }),
    entry('beneficiary change before payment', 'Confirmed beneficiary change review', 'The vendor sent updated payment details and our team completed the standard callback.', '$16,250.00', 'Vendor beneficiary update - verified callback - training destination ending 7743', 'Release', 'The established vendor contact, ownership record, and approval trail confirm the new beneficiary.', { priority: 'High' }),
  ],
  'credit-risk': [
    entry('credit line increase', 'Consumer line-increase review', 'I requested a higher line after my income increased and supplied updated documents.', '$7,500.00', 'Credit line increase - existing consumer account - training account ending 3011', 'Support Credit Request', 'Verified income, stable payment history, and acceptable utilization support the request.', { family: 'Existing consumer account review' }),
    entry('income inflation', 'Stated and verified income review', 'My application lists my expected annual income based on recent contract work.', '$12,000.00', 'Consumer credit application - stated income review - training application ending 4806', 'More Information Needed', 'Deposits do not yet support the stated annual income, and current contract documentation is missing.', { family: 'New consumer application' }),
    entry('first-payment default concern', 'First-payment-default review', 'I opened the account recently and need time to make the first scheduled payment.', '$4,200.00', 'New credit account - first payment missed - training account ending 7726', 'Refer to Fraud Review', 'Identity, payment account, and rapid utilization records indicate possible intentional application abuse.', { family: 'New consumer application', priority: 'High' }),
    entry('repayment stress', 'Existing consumer account review', 'I am asking to keep the account available while my recent payment situation changes.', '$4,800.00', 'Existing credit account review - utilization and payment history - training account ending 3011', 'Refer to Collections or Hardship', 'Income disruption and rising obligations explain repayment stress without establishing fraud.', { id: 'cr-existing-consumer', family: 'Existing consumer account review' }),
    entry('bust-out concern', 'Existing business exposure review', 'The business requests continued access while revenue and payment activity are reviewed.', '$22,500.00', 'Business revolving-credit exposure review - payment and revenue packet - training account ending 8840', 'Reduce Exposure', 'Rapid credit utilization, declining deposits, and missed payments support reducing exposure.', { id: 'cr-existing-business', family: 'Existing business account review', priority: 'High' }),
    entry('synthetic identity concern', 'Thin-file synthetic identity review', 'I submitted the application with the identity and address records available to me.', '$9,800.00', 'Consumer credit application - thin identity file - training application ending 1940', 'Refer to Fraud Review', 'The identity elements exist separately but do not form a consistent person across independent sources.', { family: 'New consumer application', priority: 'High' }),
    entry('fake application', 'Unsupported application review', 'I applied online and uploaded the documents requested by the application.', '$15,000.00', 'Consumer credit application - document review - training application ending 6285', 'Do Not Support Credit Request', 'Submitted income and identity documents conflict with source records.', { family: 'New consumer application', priority: 'High' }),
    entry('loan stacking', 'Concurrent credit inquiry review', 'I applied with several lenders while comparing financing options.', '$18,500.00', 'Consumer lending request - recent inquiry cluster - training application ending 9054', 'Escalate Senior Review', 'Multiple new obligations may materially change repayment capacity and require senior review.', { family: 'New consumer application', priority: 'High' }),
    entry('business revenue mismatch', 'New business credit application review', 'Our business is applying for credit to support operating expenses.', '$18,000.00', 'Business credit application - stated revenue packet - training business account ending 7280', 'More Information Needed', 'Bank deposits and tax support do not yet reconcile to stated annual revenue.', { id: 'cr-new-business', family: 'New business application', priority: 'High' }),
    entry('first-party credit abuse', 'Early credit-line draw review', 'I recently opened the account and requested a draw from the available credit line.', '$2,400.00', 'Personal credit-line draw request - payment setup packet - training destination token', 'Refer to Fraud Review', 'The new account shows rapid utilization, unsupported identity changes, and an unrelated payment destination.', { family: 'New consumer application', priority: 'High' }),
  ],
  'business-loan-bust-out': [
    entry('sleeper LLC sudden draw', 'Dormant business sudden-draw review', 'The business is drawing on its line to fund a newly awarded operating contract.', '$48,000.00', 'Business credit draw - dormant account history - training line ending 1842', 'Hold Pending Verification', 'A long-dormant entity requested a large draw without current revenue or contract support.', { priority: 'Critical' }),
    entry('rapid credit facility stacking', 'Business facility-stacking review', 'We applied for several facilities to expand inventory before our busy season.', '$76,500.00', 'Business credit applications - concurrent facilities - training business ending 5210', 'Escalate to Credit Risk', 'Multiple recent facilities materially increase total exposure beyond documented cash flow.', { priority: 'Critical' }),
    entry('synthetic owner identity', 'Beneficial-owner identity review', 'The listed owner supplied identification and signed the business application.', '$35,000.00', 'Business loan application - owner verification - training business ending 3608', 'Refer to Fraud Review', 'Owner identity elements do not connect across registration, address, phone, and public-record sources.', { priority: 'Critical' }),
    entry('revenue mismatch', 'Business revenue reconciliation', 'Our seasonal revenue is higher than the recent bank statement period suggests.', '$29,500.00', 'Business loan request - revenue verification - training business ending 2713', 'Request Documents', 'The stated revenue may be seasonal, but tax and contract support is still missing.', { priority: 'High' }),
    entry('large draws after limit increase', 'Business credit draw and revenue review', 'The business needs access to its approved line for a seasonal operating expense.', '$31,200.00', 'Business credit draw - line increase history - training business line ending 6180', 'Approve With Restrictions', 'Operating records support a legitimate need, but recent payment volatility supports restricted availability.', { id: 'blo-sudden-draw', priority: 'High' }),
    entry('business legitimacy mismatch', 'Business operating-footprint review', 'Our company operates remotely and uses a registered-agent address.', '$24,000.00', 'Business credit application - operating footprint - training business ending 8049', 'Deny Application', 'Registration exists, but the website, customers, banking, invoices, and stated operations cannot be independently supported.', { priority: 'High' }),
    entry('tradeline piggyback business application', 'Business tradeline ownership review', 'The application includes established trade references supplied by our finance consultant.', '$41,000.00', 'Business loan application - tradeline review - training business ending 1153', 'Refer to Fraud Review', 'The trade references belong to unrelated businesses and were added shortly before the application.', { priority: 'High' }),
  ],
  'application-verification': [
    entry('ID mismatch', 'Identity-document field review', 'The application used my current information, but one document may still show an older name.', '$0.00', 'New application - identity document comparison - no transaction in scope', 'Request additional identity or address documentation', 'The document difference may be explainable, but supporting name-change documentation is missing.'),
    entry('address cannot be verified', 'Application identity and address review', 'I submitted the application using my current contact information and address.', '$0.00', 'New application profile - identity and address packet - no transaction in scope', 'Unable to verify with current records', 'The stated address is not supported by documents, public records, or contact history.', { id: 'avr-address-device' }),
    entry('thin identity profile', 'Thin identity profile review', 'I recently established credit and have limited records under my name.', '$0.00', 'New application - limited identity history - no transaction in scope', 'Hold pending verification', 'The identity is plausible but lacks enough independent history for completion.'),
    entry('new email and new device', 'New contact and device application review', 'I created a new email and applied from a replacement phone.', '$0.00', 'New application - new email and device - no transaction in scope', 'Request additional identity or address documentation', 'Both contact and device are new, requiring another independent identity source.'),
    entry('selfie/liveness mismatch', 'Selfie and liveness review', 'The selfie check had trouble reading my face and identification.', '$0.00', 'New application - selfie and liveness packet - no transaction in scope', 'Route for identity verification review', 'The liveness result and document portrait cannot be reconciled automatically.', { priority: 'High' }),
    entry('phone ownership mismatch', 'Phone ownership verification', 'The phone number on my application is part of a family mobile plan.', '$0.00', 'New application - phone ownership packet - no transaction in scope', 'Hold pending verification', 'The phone owner differs, but an authorized family relationship may explain the mismatch.'),
    entry('synthetic identity concern', 'Synthetic identity application review', 'I supplied all requested identity details through the online application.', '$0.00', 'New application - identity cluster review - no transaction in scope', 'Route for secondary fraud review', 'The Training ID, address, phone, and credit history do not form a consistent identity.', { priority: 'Critical' }),
    entry('stolen identity application', 'Victim identity application review', 'I did not submit this application and only learned about it from an alert.', '$0.00', 'New application - victim notification - no transaction in scope', 'Route for secondary fraud review', 'The real identity holder denied applying and the device and contact details are unrelated.', { priority: 'Critical' }),
  ],
  'ach-wire-check': [
    entry('ACH unauthorized return', 'ACH authorization and return review', 'I do not recognize the debit and did not authorize this company to withdraw funds.', '$1,264.80', 'ACH debit - originator review - training account ending 2064', 'Support Customer Claim', 'No valid authorization or prior relationship supports the ACH debit.', { priority: 'High' }),
    entry('wire beneficiary change', 'Wire beneficiary change review', 'Our team received a request to send the payment to a different beneficiary account.', '$12,750.00', 'Wire payment instruction - beneficiary destination update - training destination ending 0917', 'Escalate Investigation', 'The beneficiary changed outside the established process and trusted callback is incomplete.', { id: 'awc-wire-beneficiary', priority: 'High' }),
    entry('check alteration', 'Altered check image review', 'The payee and amount on the posted check do not match the check I issued.', '$6,420.00', 'Business check - payee and amount alteration - training account ending 4470', 'Support Customer Claim', 'Front and back images show alteration inconsistent with the issued-check record.', { priority: 'High' }),
    entry('check endorsement concern', 'Check endorsement and deposit review', 'The intended payee says the check was never received or deposited by them.', '$3,890.00', 'Business check - endorsement review - training account ending 7801', 'Insufficient Evidence', 'The endorsement is unclear and deposit-account ownership records remain pending.', { priority: 'High' }),
    entry('payment recovery review', 'Payment recall and recoverability review', 'We released the payment before learning the instruction may have been false.', '$24,600.00', 'Wire payment - recall request - training destination ending 3218', 'Escalate Investigation', 'The payment requires immediate recall and beneficiary coordination while authorization facts are reviewed.', { priority: 'Critical' }),
  ],
};

const personalCreditProducts = [PRODUCT_TYPES.CREDIT_CARD, PRODUCT_TYPES.PERSONAL_LOAN, PRODUCT_TYPES.PERSONAL_LINE_OF_CREDIT];
const personalLoanOrLineProducts = [PRODUCT_TYPES.PERSONAL_LOAN, PRODUCT_TYPES.PERSONAL_LINE_OF_CREDIT];
const personalRevolvingProducts = [PRODUCT_TYPES.CREDIT_CARD, PRODUCT_TYPES.PERSONAL_LINE_OF_CREDIT];
const businessCreditProducts = [PRODUCT_TYPES.BUSINESS_CREDIT_CARD, PRODUCT_TYPES.BUSINESS_LOAN, PRODUCT_TYPES.BUSINESS_LINE_OF_CREDIT];
const businessRevolvingProducts = [PRODUCT_TYPES.BUSINESS_CREDIT_CARD, PRODUCT_TYPES.BUSINESS_LINE_OF_CREDIT];
const businessLoanOrLineProducts = [PRODUCT_TYPES.BUSINESS_LOAN, PRODUCT_TYPES.BUSINESS_LINE_OF_CREDIT];

function fromCatalog(sourceClaimTypeId, predicate = () => true, domain = {}) {
  return (scenarioCatalog[sourceClaimTypeId] ?? [])
    .filter(predicate)
    .map((spec) => ({ ...spec, sourceClaimTypeId, ...domain }));
}

const accountAccess = scenarioCatalog['account-takeover'];
const cardAccessPattern = /credential stuffing|phishing|session hijack|wallet enrollment/i;
const personalApplicationPattern = /income inflation|synthetic identity concern|fake application/i;

const workflowScenarioCatalog = {
  [WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM]: [
    ...fromCatalog('fraud-chargeback', () => true, { customerTypes: [CUSTOMER_TYPES.PERSONAL], productTypes: [PRODUCT_TYPES.CREDIT_CARD] }),
    ...fromCatalog('first-party-fraud', () => true, { customerTypes: [CUSTOMER_TYPES.PERSONAL], productTypes: [PRODUCT_TYPES.CREDIT_CARD] }),
  ],
  [WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE]: fromCatalog('non-fraud-chargeback', () => true, {
    customerTypes: [CUSTOMER_TYPES.PERSONAL],
    productTypes: [PRODUCT_TYPES.CREDIT_CARD],
  }),
  [WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER]: fromCatalog('account-takeover', (spec) => cardAccessPattern.test(spec.subtype), {
    customerTypes: [CUSTOMER_TYPES.PERSONAL],
    productTypes: [PRODUCT_TYPES.CREDIT_CARD],
  }),
  [WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER]: fromCatalog('account-takeover', (spec) => !cardAccessPattern.test(spec.subtype), {
    customerTypes: [CUSTOMER_TYPES.PERSONAL],
    productTypes: [PRODUCT_TYPES.DEPOSIT_ACCOUNT],
  }),
  [WORKFLOW_TYPES.ACH_TRANSACTION_CLAIM]: fromCatalog('ach-wire-check', (spec) => /^ACH/i.test(spec.subtype), {
    customerTypes: [CUSTOMER_TYPES.PERSONAL],
    productTypes: [PRODUCT_TYPES.DEPOSIT_ACCOUNT],
  }),
  [WORKFLOW_TYPES.WIRE_TRANSACTION_CLAIM]: fromCatalog('ach-wire-check', (spec) => /wire|payment recovery/i.test(spec.subtype), {
    customerTypes: [CUSTOMER_TYPES.PERSONAL],
    productTypes: [PRODUCT_TYPES.DEPOSIT_ACCOUNT],
  }),
  [WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER]: accountAccess
    .filter((spec) => /credential stuffing|help desk reset|profile change|new payee/i.test(spec.subtype))
    .map((spec) => ({
      ...spec,
      sourceClaimTypeId: 'account-takeover',
      customerTypes: [CUSTOMER_TYPES.BUSINESS],
      productTypes: [PRODUCT_TYPES.BUSINESS_ACCOUNT, PRODUCT_TYPES.BUSINESS_CREDIT_CARD, PRODUCT_TYPES.BUSINESS_LOAN, PRODUCT_TYPES.BUSINESS_LINE_OF_CREDIT],
      statement: 'The business reported unfamiliar administrator, profile, or payment activity in its account.',
      entityRole: 'Business administrator',
    })),
  [WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT]: fromCatalog('email-bec', () => true, {
    customerTypes: [CUSTOMER_TYPES.BUSINESS],
    productTypes: [PRODUCT_TYPES.BUSINESS_ACCOUNT],
  }),
  [WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW]: fromCatalog('ach-wire-check', (spec) => /^ACH/i.test(spec.subtype), {
    customerTypes: [CUSTOMER_TYPES.BUSINESS],
    productTypes: [PRODUCT_TYPES.BUSINESS_ACCOUNT],
    statement: 'The business reported an ACH entry or instruction that requires authorization review.',
    entityRole: 'Business payment contact',
  }),
  [WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW]: fromCatalog('ach-wire-check', (spec) => /wire|payment recovery/i.test(spec.subtype), {
    customerTypes: [CUSTOMER_TYPES.BUSINESS],
    productTypes: [PRODUCT_TYPES.BUSINESS_ACCOUNT],
  }),
  [WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT]: fromCatalog('payroll-direct-deposit', (spec) => !/admin portal compromise/i.test(spec.subtype), {
    customerTypes: [CUSTOMER_TYPES.BUSINESS],
    productTypes: [PRODUCT_TYPES.PAYROLL_PRODUCT],
  }),
  [WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER]: fromCatalog('payroll-direct-deposit', (spec) => /admin portal compromise/i.test(spec.subtype), {
    customerTypes: [CUSTOMER_TYPES.BUSINESS],
    productTypes: [PRODUCT_TYPES.PAYROLL_PRODUCT],
  }),
  [WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW]: [
    ...fromCatalog('application-verification', () => true, {
      customerTypes: [CUSTOMER_TYPES.PERSONAL],
      productTypes: personalCreditProducts,
    }),
    ...fromCatalog('credit-risk', (spec) => personalApplicationPattern.test(spec.subtype), {
      customerTypes: [CUSTOMER_TYPES.PERSONAL],
      productTypes: personalCreditProducts,
    }),
    ...fromCatalog('credit-risk', (spec) => /loan stacking/i.test(spec.subtype), {
      customerTypes: [CUSTOMER_TYPES.PERSONAL],
      productTypes: personalLoanOrLineProducts,
    }),
    ...fromCatalog('credit-risk', (spec) => /business revenue mismatch/i.test(spec.subtype), {
      customerTypes: [CUSTOMER_TYPES.BUSINESS],
      productTypes: businessCreditProducts,
    }),
    ...fromCatalog('business-loan-bust-out', (spec) => /synthetic owner identity|revenue mismatch|tradeline piggyback/i.test(spec.subtype), {
      customerTypes: [CUSTOMER_TYPES.BUSINESS],
      productTypes: [PRODUCT_TYPES.BUSINESS_LOAN],
    }),
    ...fromCatalog('business-loan-bust-out', (spec) => /business legitimacy mismatch/i.test(spec.subtype), {
      customerTypes: [CUSTOMER_TYPES.BUSINESS],
      productTypes: businessLoanOrLineProducts,
    }),
  ],
  [WORKFLOW_TYPES.CREDIT_RISK_REVIEW]: [
    ...fromCatalog('credit-risk', (spec) => /credit line increase/i.test(spec.subtype), {
      customerTypes: [CUSTOMER_TYPES.PERSONAL],
      productTypes: personalRevolvingProducts,
    }),
    ...fromCatalog('credit-risk', (spec) => /first-payment default concern/i.test(spec.subtype), {
      customerTypes: [CUSTOMER_TYPES.PERSONAL],
      productTypes: personalCreditProducts,
    }),
    ...fromCatalog('credit-risk', (spec) => /repayment stress/i.test(spec.subtype), {
      customerTypes: [CUSTOMER_TYPES.PERSONAL],
      productTypes: personalRevolvingProducts,
    }),
    ...fromCatalog('credit-risk', (spec) => /first-party credit abuse/i.test(spec.subtype), {
      customerTypes: [CUSTOMER_TYPES.PERSONAL],
      productTypes: [PRODUCT_TYPES.PERSONAL_LINE_OF_CREDIT],
    }),
    ...fromCatalog('credit-risk', (spec) => /bust-out concern/i.test(spec.subtype), {
      customerTypes: [CUSTOMER_TYPES.BUSINESS],
      productTypes: businessRevolvingProducts,
    }),
    ...fromCatalog('business-loan-bust-out', (spec) => /sleeper|large draws after limit increase/i.test(spec.subtype), {
      customerTypes: [CUSTOMER_TYPES.BUSINESS],
      productTypes: [PRODUCT_TYPES.BUSINESS_LINE_OF_CREDIT],
    }),
    ...fromCatalog('business-loan-bust-out', (spec) => /rapid credit facility stacking/i.test(spec.subtype), {
      customerTypes: [CUSTOMER_TYPES.BUSINESS],
      productTypes: businessLoanOrLineProducts,
    }),
  ],
};

const scenarioTruthByKey = new Map();
const legacyScenarioPrefixes = {
  'account-takeover': 'ato',
  'fraud-chargeback': 'fcb',
  'non-fraud-chargeback': 'ncb',
  'first-party-fraud': 'fpf',
  'payroll-direct-deposit': 'pay',
  'email-bec': 'bec',
  'credit-risk': 'cr',
  'business-loan-bust-out': 'blo',
  'application-verification': 'avr',
  'ach-wire-check': 'awc',
};

function slug(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function publicAlertReason(workflowType, spec) {
  const source = `${spec.subtype} ${spec.transactionInfo}`.toLowerCase();
  if (workflowType === WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM) {
    if (/wallet/.test(source)) return 'Unrecognized digital-wallet card activity';
    if (/atm/.test(source)) return 'Unrecognized ATM card activity';
    if (/point-of-sale|chip|contactless|pos/.test(source)) return 'Unrecognized card-present transaction';
    if (/delivery|not received/.test(source)) return 'Card purchase and delivery allegation';
    return 'Unrecognized card transaction';
  }
  if (workflowType === WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE) {
    if (/duplicate/.test(source)) return 'Duplicate billing reported';
    if (/refund|return credit/.test(source)) return 'Refund or return credit not posted';
    if (/cancel|subscription/.test(source)) return 'Cancellation or subscription billing issue';
    if (/not rendered|not described/.test(source)) return 'Goods or services issue';
    if (/incorrect amount/.test(source)) return 'Incorrect amount reported';
    return 'Merchant billing or service issue';
  }
  if (workflowType === WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER) return 'New card-access or wallet activity observed';
  if (workflowType === WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER) return 'New account-access or profile activity observed';
  if (workflowType === WORKFLOW_TYPES.ACH_TRANSACTION_CLAIM) return 'Unrecognized ACH debit reported';
  if (workflowType === WORKFLOW_TYPES.WIRE_TRANSACTION_CLAIM) return 'Wire instruction or authorization questioned';
  if (workflowType === WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER) return 'New business-account access or administrator activity observed';
  if (workflowType === WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT) {
    return /urgent|CEO/i.test(source) ? 'Unusual business payment instruction reported' : 'Business payment destination or instruction changed';
  }
  if (workflowType === WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW) return 'Business ACH instruction or activity requires review';
  if (workflowType === WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW) return 'Business wire instruction or activity requires review';
  if (workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT) {
    if (/new-hire|ghost employee/.test(source)) return 'New employee added';
    if (/amount/.test(source)) return 'Unusual payroll amount observed';
    return 'Employee payment destination changed';
  }
  if (workflowType === WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER) return 'New session and payroll administrator activity observed';
  if (workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW) {
    return spec.customerTypes?.includes(CUSTOMER_TYPES.BUSINESS)
      ? 'Business application information requires verification'
      : 'Application information requires verification';
  }
  if (workflowType === WORKFLOW_TYPES.CREDIT_RISK_REVIEW) {
    if (/stacking|concurrent facilities/.test(source)) return 'Concurrent credit facilities require review';
    if (/revolving-credit|draw|line|utilization/.test(source)) return 'Credit utilization or draw activity requires review';
    if (/payment|repayment|default/.test(source)) return 'Payment behavior requires review';
    return 'Existing credit exposure requires review';
  }
  return 'Activity requires review';
}

const customerReportedWorkflows = new Set([
  WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
  WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE,
  WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER,
  WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER,
  WORKFLOW_TYPES.ACH_TRANSACTION_CLAIM,
  WORKFLOW_TYPES.WIRE_TRANSACTION_CLAIM,
  WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER,
]);

function cleanSentence(value = '') {
  const text = String(value).trim().replace(/\s+/g, ' ').replace(/[.]+$/, '');
  return text ? `${text}.` : '';
}

function publicTransactionInfo(spec) {
  return String(spec.transactionInfo ?? '')
    .replace(/compromised mailbox|email request|mailbox thread|reply-to mismatch|forwarding rule|email/gi, 'instruction source pending verification');
}

function caseOriginFor(workflowType) {
  if (customerReportedWorkflows.has(workflowType)) {
    return { type: 'customer-reported-claim', label: 'Customer or business report' };
  }
  if (workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW) {
    return { type: 'verification-review', label: 'Application verification review' };
  }
  if (workflowType === WORKFLOW_TYPES.CREDIT_RISK_REVIEW) {
    return { type: 'credit-policy-review', label: 'Credit monitoring or policy review' };
  }
  return { type: 'operations-alert', label: 'Operations or monitoring alert' };
}

function creditRiskTrigger(spec, transactionInfo) {
  const source = `${spec.subtype} ${transactionInfo}`.toLowerCase();
  if (/line increase/.test(source)) {
    return `A ${spec.amount} line-increase request and its updated income documents required a manual credit-policy comparison`;
  }
  if (/first.payment|missed/.test(source)) {
    return `The first scheduled payment was missed on a recently opened credit account, requiring account-age, payment, and contact-history comparison`;
  }
  if (/repayment stress|utilization and payment/.test(source)) {
    return 'A change across utilization and payment behavior required comparison with the established account history';
  }
  if (/payment setup|destination/.test(source)) {
    return `A ${spec.amount} credit-line draw was paired with a newly established payment destination whose ownership and prior use required verification`;
  }
  if (/concurrent|stacking|facilities/.test(source)) {
    return 'Multiple credit facilities appeared in the same review window and required exposure, application-timing, and repayment-capacity comparison';
  }
  if (/dormant|line increase history|revolving-credit|draw|utilization/.test(source)) {
    return `The ${spec.amount} draw or utilization change differed from the supplied account-history context and required revenue, payment, and authorization comparison`;
  }
  return 'The existing exposure crossed a configured credit-policy review condition and required comparison with payment, income, and account-history records';
}

function caseEscalationReason(workflowType, spec, transactionInfo) {
  const activity = cleanSentence(`${transactionInfo} for ${spec.amount}`).replace(/[.]$/, '');
  const statement = cleanSentence(spec.statement).replace(/[.]$/, '');
  if (customerReportedWorkflows.has(workflowType)) {
    return `A report identified ${activity} and stated: “${statement}” The report opened the applicable claim review; it did not establish authorization, responsibility, or the outcome.`;
  }
  if (workflowType === WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT) {
    return `A changed business payment instruction involving ${activity} was routed to manual review because trusted-source and destination-ownership verification were not complete at intake.`;
  }
  if ([WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW, WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW].includes(workflowType)) {
    return `The business activity involving ${activity} was routed to manual review because instruction authority and destination ownership required cross-source verification.`;
  }
  if (workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT) {
    return `The payroll change involving ${activity} was routed to manual review because the platform does not know how the change was requested at intake; the request method is unknown at intake, and trusted employee or manager validation was not yet established.`;
  }
  if (workflowType === WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER) {
    return `The payroll change involving ${activity} followed a new off-hours administrator session, so the initiator, approver, device, IP, and funds status required manual comparison.`;
  }
  if (workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW) {
    return `${cleanSentence(`The application involving ${activity}`).replace(/[.]$/, '')} was routed to verification review because two or more application fields, identity records, or supporting documents required cross-source reconciliation.`;
  }
  if (workflowType === WORKFLOW_TYPES.CREDIT_RISK_REVIEW) {
    return `${cleanSentence(creditRiskTrigger(spec, transactionInfo)).replace(/[.]$/, '')}. The review condition did not establish intent or a fraud finding.`;
  }
  return `${cleanSentence(`${activity} met a configured manual-review condition`).replace(/[.]$/, '')}. The condition is a routing event, not a finding.`;
}

function alertHandlingNote(workflowType) {
  if (customerReportedWorkflows.has(workflowType)) {
    return 'This case began with a report or claim. Recording that report opens a review but does not prove the activity was unauthorized, valid, or fraudulent.';
  }
  if (workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW) {
    return 'A verification review is not automatically a fraud case. Routine applications can pass automated checks; unresolved cross-source conditions are routed for manual review.';
  }
  if (workflowType === WORKFLOW_TYPES.CREDIT_RISK_REVIEW) {
    return 'Credit use, draws, limit requests, and payment changes can be normal. Only configured policy conditions or unresolved cross-source comparisons are routed to this manual-review queue.';
  }
  return 'Not every alert becomes a case. This training queue contains alerts routed to manual review because multiple conditions or unresolved control checks were present; other alerts may remain monitoring events or close without a case.';
}

function reportedAllegation(workflowType, spec, escalationReason) {
  if (customerReportedWorkflows.has(workflowType)) {
    return `${cleanSentence(spec.statement)} The report remains unconfirmed pending investigation.`;
  }
  return escalationReason;
}

function suspectedPatternsFor(spec, workflowType) {
  const value = `${spec.subtype} ${spec.truth}`.toLowerCase();
  const patterns = [];
  if (/synthetic/.test(value)) patterns.push(SUSPECTED_PATTERNS.SYNTHETIC_IDENTITY);
  if (
    workflowType === WORKFLOW_TYPES.CREDIT_RISK_REVIEW
    && /bust-out|sleeper llc|large draws after|rapid credit facility stacking/.test(value)
  ) {
    patterns.push(SUSPECTED_PATTERNS.BUST_OUT);
  }
  if (/first-party|friendly fraud|household member use|digital goods used|retained merchandise|dispute after usage/.test(value)) patterns.push(SUSPECTED_PATTERNS.FIRST_PARTY_FRAUD);
  if (/email-bec|spoofed employee email|compromised employee email|look-alike domain|mailbox|reply-to|invoice diversion|executive impersonation/.test(value)) {
    patterns.push(SUSPECTED_PATTERNS.EMAIL_COMPROMISE_BEC);
  }
  if (
    [
      WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER,
      WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER,
      WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER,
      WORKFLOW_TYPES.ACH_TRANSACTION_CLAIM,
      WORKFLOW_TYPES.WIRE_TRANSACTION_CLAIM,
      WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT,
      WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW,
      WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW,
      WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
      WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER,
      WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
      WORKFLOW_TYPES.CREDIT_RISK_REVIEW,
    ].includes(workflowType)
    && /(?:destination|beneficiary|payment account).*(?:unrelated|no prior customer relationship|ownership does not match)|(?:unrelated|no prior customer relationship).*(?:destination|beneficiary|payment account)/.test(value)
  ) {
    patterns.push(SUSPECTED_PATTERNS.MULE_ACTIVITY);
  }
  if (/stolen identity/.test(value)) patterns.push(SUSPECTED_PATTERNS.STOLEN_IDENTITY);
  if (/business legitimacy|revenue mismatch|tradeline.*unrelated/.test(value)) patterns.push(SUSPECTED_PATTERNS.FABRICATED_BUSINESS_INFORMATION);
  if (/owner identity|owner mismatch/.test(value)) patterns.push(SUSPECTED_PATTERNS.OWNER_MISMATCH);
  if ([WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER, WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER, WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER, WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER].includes(workflowType)) {
    patterns.push(SUSPECTED_PATTERNS.ACCOUNT_TAKEOVER);
  }
  return [...new Set(patterns)];
}

function normalizeOperationalDecision(workflowType, value = '') {
  const choice = value.toLowerCase();
  if ([WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW].includes(workflowType)) {
    if (/deny/.test(choice)) return 'Deny';
    if (/approve|complete application/.test(choice)) return 'Approve';
    if (/request|more information|unable|hold pending/.test(choice)) return 'Request More Information';
    return 'Escalate';
  }
  if (workflowType === WORKFLOW_TYPES.CREDIT_RISK_REVIEW) {
    if (/reduce|restriction|collections|hardship/.test(choice)) return 'Restrict / Reduce';
    if (/hold pending|hold/.test(choice)) return 'Hold';
    if (/more information|request document/.test(choice)) return 'Request More Information';
    if (/escalate|refer.*fraud/.test(choice)) return 'Escalate';
    return 'Maintain';
  }
  if ([WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT, WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER, WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT, WORKFLOW_TYPES.ACH_TRANSACTION_REVIEW, WORKFLOW_TYPES.WIRE_TRANSACTION_REVIEW].includes(workflowType)) {
    if (/release/.test(choice)) return 'Release';
    if (/more information|insufficient/.test(choice)) return 'More Information Needed';
    if (/escalate/.test(choice)) return 'Escalate';
    return 'Hold';
  }
  if ([WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER, WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER, WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER].includes(workflowType)) {
    if (/insufficient|more information/.test(choice)) return 'More Information Needed';
    if (/escalate/.test(choice)) return 'Escalate';
    if (/do not support|release/.test(choice)) return 'Maintain';
    if (/support/.test(choice)) return 'Restrict';
    return 'Hold';
  }
  if (/do not support/.test(choice)) return 'Do Not Support Customer Claim';
  if (/partial/.test(choice)) return 'Partial Credit';
  if (/insufficient|more information/.test(choice)) return 'Insufficient Evidence';
  if (/escalate/.test(choice)) return 'Escalate';
  return 'Support Customer Claim';
}

function finalFindingFor(spec, workflowType, patterns, operationalDecision) {
  const value = `${spec.subtype} ${spec.truth}`.toLowerCase();
  if (workflowType === WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE) return FINAL_FINDINGS.NON_FRAUD_DISPUTE;
  if (workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW) {
    if (patterns.some((pattern) => [SUSPECTED_PATTERNS.SYNTHETIC_IDENTITY, SUSPECTED_PATTERNS.STOLEN_IDENTITY, SUSPECTED_PATTERNS.FABRICATED_BUSINESS_INFORMATION].includes(pattern))
      && /do not form|denied applying|conflict|cannot be independently supported|unrelated businesses/.test(value)) return FINAL_FINDINGS.FRAUD_CONFIRMED;
    if (/missing|lacks enough|pending|may be explainable|cannot be reconciled automatically|do not yet reconcile/.test(value)) return FINAL_FINDINGS.VERIFICATION_INCOMPLETE;
    return FINAL_FINDINGS.INCONCLUSIVE;
  }
  if (workflowType === WORKFLOW_TYPES.CREDIT_RISK_REVIEW) {
    if (patterns.includes(SUSPECTED_PATTERNS.BUST_OUT) && /intentional|long-dormant|rapid.*missed|without current revenue/.test(value)) return FINAL_FINDINGS.FRAUD_CONFIRMED;
    return FINAL_FINDINGS.CREDIT_RISK_CONCERN;
  }
  if ([WORKFLOW_TYPES.BUSINESS_PAYMENT_INSTRUCTION_CHANGE_ALERT, WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT, WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER].includes(workflowType)) {
    if (operationalDecision === 'Release') return FINAL_FINDINGS.FRAUD_NOT_FOUND;
    if (operationalDecision === 'More Information Needed' || operationalDecision === 'Escalate') return FINAL_FINDINGS.INCONCLUSIVE;
    return FINAL_FINDINGS.FRAUD_CONFIRMED;
  }
  if (patterns.includes(SUSPECTED_PATTERNS.FIRST_PARTY_FRAUD) && /used|authorized user|delivery photo|empty parcel/.test(value)) return FINAL_FINDINGS.FRAUD_CONFIRMED;
  if (/do not support/.test(spec.correctDetermination.toLowerCase())) return FINAL_FINDINGS.FRAUD_NOT_FOUND;
  if (/insufficient|escalate|more information/.test(spec.correctDetermination.toLowerCase())) return FINAL_FINDINGS.INCONCLUSIVE;
  return FINAL_FINDINGS.FRAUD_CONFIRMED;
}

function publicStatement(workflowType, spec, escalationReason) {
  if (customerReportedWorkflows.has(workflowType)) return cleanSentence(spec.statement);
  return escalationReason;
}

function publicEntityRole(workflowType, customerType, suppliedRole) {
  if (workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT) return 'Affected employee';
  if (workflowType === WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER) return 'Payroll administrator named in the alert';
  if (workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW) {
    return customerType === CUSTOMER_TYPES.BUSINESS ? 'Application submitter' : 'Credit applicant';
  }
  if (workflowType === WORKFLOW_TYPES.CREDIT_RISK_REVIEW) {
    return customerType === CUSTOMER_TYPES.BUSINESS ? 'Business account contact' : 'Existing account holder';
  }
  return suppliedRole ?? (customerType === CUSTOMER_TYPES.BUSINESS ? 'Business account contact' : 'Personal customer');
}

function toolkitFor(claimType, spec) {
  if (claimType.id === WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM && /lost card|stolen card|never received|counterfeit|ATM\/POS/i.test(spec.subtype)) {
    return claimType.availableTools.filter((tool) => !['Login History', 'Session History', 'Device Intelligence'].includes(tool));
  }
  return [...claimType.availableTools];
}

function buildScenario(claimType, spec, index) {
  const legacyScenarioId = spec.id ?? `${legacyScenarioPrefixes[spec.sourceClaimTypeId] ?? slug(spec.sourceClaimTypeId)}-${slug(spec.subtype)}`;
  const scenarioId = `${claimType.prefix.toLowerCase()}-scenario-${String(index + 1).padStart(2, '0')}`;
  const alertReason = publicAlertReason(claimType.workflowType, spec);
  const transactionInfo = publicTransactionInfo(spec);
  const origin = caseOriginFor(claimType.workflowType);
  const escalationReason = caseEscalationReason(claimType.workflowType, spec, transactionInfo);
  const handlingNote = alertHandlingNote(claimType.workflowType);
  const allegation = reportedAllegation(claimType.workflowType, spec, escalationReason);
  const patterns = suspectedPatternsFor(spec, claimType.workflowType);
  const operationalDecision = normalizeOperationalDecision(claimType.workflowType, spec.correctDetermination);
  const finalFinding = finalFindingFor(spec, claimType.workflowType, patterns, operationalDecision);
  const containsEmailPattern = patterns.includes(SUSPECTED_PATTERNS.EMAIL_COMPROMISE_BEC);
  const scenarioTruthId = `${claimType.workflowType}:${scenarioId}`;
  const disclosure = {
    requestMethodAtIntake: claimType.workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT ? 'unknown' : 'not established',
    emailEvidenceAvailableAtIntake: false,
    emailEvidenceStage: containsEmailPattern ? 'business-supplied-after-trusted-contact' : 'not applicable',
    businessReportedRequestMethod: containsEmailPattern ? 'email' : 'not established',
  };
  const truth = Object.freeze({
    scenarioTruthId,
    suspectedPatterns: Object.freeze(patterns),
    operationalDecision,
    finalFinding,
    findingBasis: spec.truth,
    classification: spec.truth,
    correctDetermination: operationalDecision,
    acceptedDeterminations: Object.freeze([operationalDecision]),
    legacyOperationalDecision: spec.correctDetermination,
    disclosure: Object.freeze(disclosure),
    revealMode: 'post-submission',
  });
  scenarioTruthByKey.set(scenarioTruthId, truth);

  const customerType = spec.customerTypes?.[0] ?? claimType.customerType;
  const productType = spec.productTypes?.[0] ?? claimType.productType;
  const publicScenario = {
    id: scenarioId,
    title: /\breview$/i.test(alertReason) ? alertReason : `${alertReason} review`,
    subtype: alertReason,
    alertReason,
    reportedAllegation: allegation,
    caseOriginType: origin.type,
    caseOrigin: origin.label,
    caseEscalationReason: escalationReason,
    alertHandlingNote: handlingNote,
    summary: `${allegation} ${handlingNote} The fictional packet contains routine and exception evidence for review.`,
    statement: publicStatement(claimType.workflowType, spec, escalationReason),
    channel: claimType.workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT
      ? 'Platform payroll alert'
      : claimType.workflowType === WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER
        ? 'Platform payroll access alert'
        : spec.channel ?? (customerType === CUSTOMER_TYPES.BUSINESS ? 'Business review queue' : 'Customer review queue'),
    amount: spec.amount,
    transactionInfo,
    priority: spec.priority ?? 'Medium',
    family: claimType.label,
    entityRole: publicEntityRole(claimType.workflowType, customerType, spec.entityRole),
    customerTypes: [...(spec.customerTypes ?? claimType.customerTypes)],
    productTypes: [...(spec.productTypes ?? claimType.productTypes)],
    customerType,
    productType,
    workflowType: claimType.workflowType,
    plainEnglishMeaning: `Determine what the available records support for this ${claimType.label.toLowerCase()} without assuming the allegation or alert is true or false.`,
    timelinePattern: 'The activity is distributed across intake, system, transaction, and document records without disclosing a finding.',
    commonMistake: claimType.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW
      ? 'Treating missing verification as fraud or using a denial as a fraud finding.'
      : 'Treating a single link, status, authentication event, or allegation as a conclusion.',
    miniExample: allegation,
    expectedEvidence: [...claimType.evidenceAreas],
    toolkitTools: toolkitFor(claimType, spec),
    documents: [...claimType.documents],
    taxonomyTags: {
      customerType,
      productType,
      workflowType: claimType.workflowType,
      lifecycleStage: claimType.taxonomy.lifecycleStage,
      productRail: claimType.taxonomy.productRail,
    },
    generationIndex: index,
  };
  Object.defineProperty(publicScenario, 'generationKey', {
    value: `${spec.sourceClaimTypeId}:${spec.subtype}`,
    enumerable: false,
  });
  Object.defineProperty(publicScenario, 'legacyScenarioId', {
    value: legacyScenarioId,
    enumerable: false,
  });
  Object.defineProperty(publicScenario, 'scenarioTruthId', {
    value: scenarioTruthId,
    enumerable: false,
  });
  return publicScenario;
}

export function expandClaimScenarios(claimType) {
  const specs = workflowScenarioCatalog[claimType.id] ?? [];
  if (!specs.length) throw new Error(`${claimType.label} has no neutral scenario specifications`);
  const scenarios = specs.map((spec, index) => buildScenario(claimType, spec, index));
  return {
    ...claimType,
    subtypes: [...new Set(scenarios.map((scenario) => scenario.alertReason))],
    scenarios,
  };
}

export function getScenarioTruth(workflowType, scenarioId) {
  const truth = scenarioTruthByKey.get(`${workflowType}:${scenarioId}`);
  if (!truth) return undefined;
  return {
    ...truth,
    suspectedPatterns: [...truth.suspectedPatterns],
    acceptedDeterminations: [...truth.acceptedDeterminations],
    disclosure: { ...truth.disclosure },
  };
}

export function scenarioCatalogCounts() {
  return Object.fromEntries(Object.entries(workflowScenarioCatalog).map(([workflowType, entries]) => [workflowType, entries.length]));
}
