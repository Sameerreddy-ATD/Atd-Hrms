# Product Naming and Interface Terminology

## Recommended Product Name

**Anytime Workforce** is the canonical product name.

It is short, professional, easy to say, and broad enough for employee records, attendance,
leave, tasks, expenses, HR documents, assets, reporting, and future integrations. It avoids
limiting the product to only “HRMS” or “employee management” as operational workflows continue
to grow.

Recommended presentation:

- Product: **Anytime Workforce**
- Descriptive subtitle: **Workforce and Operations Platform**
- Browser title: **Anytime Workforce**
- PWA short name: **Workforce**
- API name: **Anytime Workforce Employee API**

The company mark **Anytime Diesel** remains the employer brand and legal entity label where
needed. Product chrome, PWA identity, and documentation refer to **Anytime Workforce**.

## Other Suitable Names

| Name                       | Best use                                 | Trade-off                                |
| -------------------------- | ---------------------------------------- | ---------------------------------------- |
| **Anytime PeopleOps**      | Broader people + ops framing             | Slightly less plain than Workforce       |
| **Anytime Crew Hub**       | Friendly operations-focused product      | “Crew” may sound field-team specific     |
| **Anytime Operations Hub** | Tasks, field work, assets, and workforce | HR capabilities are less obvious         |
| **Anytime One**            | Broad internal super-app                 | Requires a strong subtitle to explain it |

## Professional Interface Terms Applied

| Previous or ambiguous term         | Professional term                                                   | Reason                                                               |
| ---------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Certificates                       | **HR Documents**                                                    | Covers certificates, letters, and other employee documents           |
| My Expenses                        | **Expenses & HR Documents**                                         | Describes both workflows available on the page                       |
| Users                              | **User Logins**                                                     | Distinguishes authentication accounts from employee records          |
| Apply                              | **Apply**, with **Add advance expense** and **Add expense** actions | Keeps the primary action concise while making each request explicit  |
| Certificate type                   | **Document type**                                                   | Matches the broader HR Documents category                            |
| Delete user / Deactivate account | **Offboard employee**                                           | Ends employment, closes login, retains history                   |
| Module access                      | **Module Access**                                                   | Clear administrative language for role-based feature permissions     |
| API token                          | **Employee API credential**                                         | Makes the credential purpose and audience explicit                   |
| Tasks & Daily Logs / Work Progress | **Work Planner**                                                    | Jira-style projects, issue keys, Board/Backlog/Timeline, ownership, and activity |

## Naming Rules for Future Features

- Use employee-facing language in the UI and stable technical identifiers in APIs.
- Prefer action labels that describe the result: **Submit for review**, **Approve**, **Reject**,
  **Mark as paid**, **Offboard employee**, and **Deactivate**.
- Do not expose physical database table names to external integrations.
- Do not rename versioned API fields after release; introduce an additive field or a new API
  version instead.
- Keep role names singular and title-cased: **Developer Admin**, **HR**, **CEO**, **Manager**,
  and **Employee**.
- Use **HR Documents** in all new UI and documentation. The legacy physical table
  `certificate_requests` remains unchanged for migration compatibility.
