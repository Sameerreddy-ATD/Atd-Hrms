# Product Naming and Interface Terminology

## Recommended Product Name

**Anytime PeopleOps** is the recommended long-term product name.

It is short, professional, easy to say, and broad enough for employee records, attendance,
leave, tasks, expenses, HR documents, assets, reporting, and future integrations. It also
avoids limiting the product to only “HRMS” or “employee management” as operational workflows
continue to grow.

Recommended presentation:

- Product: **Anytime PeopleOps**
- Descriptive subtitle: **Workforce and Operations Platform**
- Browser title: **Anytime PeopleOps | Workforce and Operations**
- API name: **Anytime PeopleOps Employee API**

The current **Anytime Diesel Employee Management System** name remains valid and is retained
in this version to avoid an unapproved brand change. A future branding release can adopt the
recommended name without changing database or API identifiers.

## Other Suitable Names

| Name                       | Best use                                 | Trade-off                                |
| -------------------------- | ---------------------------------------- | ---------------------------------------- |
| **Anytime Workforce Hub**  | Formal company-wide portal               | Clear but less distinctive               |
| **Anytime Crew Hub**       | Friendly operations-focused product      | “Crew” may sound field-team specific     |
| **Anytime Operations Hub** | Tasks, field work, assets, and workforce | HR capabilities are less obvious         |
| **Anytime One**            | Broad internal super-app                 | Requires a strong subtitle to explain it |

## Professional Interface Terms Applied

| Previous or ambiguous term | Professional term                                                   | Reason                                                              |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Certificates               | **HR Documents**                                                    | Covers certificates, letters, and other employee documents          |
| My Expenses                | **Expenses & HR Documents**                                         | Describes both workflows available on the page                      |
| Users                      | **User Logins**                                                     | Distinguishes authentication accounts from employee records         |
| Apply                      | **Apply**, with **Add advance expense** and **Add expense** actions | Keeps the primary action concise while making each request explicit |
| Certificate type           | **Document type**                                                   | Matches the broader HR Documents category                           |
| Delete user                | **Deactivate login**                                                | Reflects the history-preserving lifecycle behavior                  |
| Module access              | **Module Access**                                                   | Clear administrative language for role-based feature permissions    |
| API token                  | **Employee API credential**                                         | Makes the credential purpose and audience explicit                  |

## Naming Rules for Future Features

- Use employee-facing language in the UI and stable technical identifiers in APIs.
- Prefer action labels that describe the result: **Submit for review**, **Approve**, **Reject**,
  **Mark as paid**, and **Deactivate**.
- Do not expose physical database table names to external integrations.
- Do not rename versioned API fields after release; introduce an additive field or a new API
  version instead.
- Keep role names singular and title-cased: **Developer Admin**, **HR**, **CEO**, **Manager**,
  and **Employee**.
- Use **HR Documents** in all new UI and documentation. The legacy physical table
  `certificate_requests` remains unchanged for migration compatibility.
