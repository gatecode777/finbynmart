# Page 24 — Default address rules

1. A buyer has at most one default billing and one default delivery address. They are independent; one address can be both.
2. A default needs the matching purpose (Billing / Delivery). Setting one without it: `PURPOSE_MISSING` (409) from the default route, 400 on create/update.
3. Setting a default clears the previous holder in the **same transaction**. Two partial unique indexes make a second default impossible even if two requests race (tested: five simultaneous "set default delivery" requests and four simultaneous creations that each ask to be default billing leave exactly one default, no server error).
4. Creating an address with a default flag takes the default over from the previous one.
5. An update that does not mention the flags keeps them. Removing the Delivery or Billing purpose from the default address clears that default; the response lists `clearedDefaults` and the message says so. Nothing else is promoted.
6. Deleting a default address removes it and reports which default(s) are now empty. No automatic promotion: choosing a billing or delivery address silently would be a business decision the buyer did not make.
7. With no default, the inquiry chooser simply lists the buyer's delivery addresses; nothing is preselected.
8. Defaults are text tags in the UI ("Default Billing", "Default Delivery"), not colour only.
