(() => {
    'use strict';

    const page = document.body.dataset.accessPage;
    const $ = (id) => document.getElementById(id);
    const state = { companies: [], users: [], requests: [], audit: [], actor: null, saving: false, loading: false };
    const guidPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
    let saveAction = null;
    let returnFocus = null;

    function node(tag, text, className) {
        const element = document.createElement(tag);
        if (text !== undefined && text !== null) element.textContent = String(text);
        if (className) element.className = className;
        return element;
    }

    function button(label, onClick, className = '') {
        const result = node('button', label, 'access-button ' + className);
        result.type = 'button';
        result.addEventListener('click', onClick);
        return result;
    }

    function cell(row, content) {
        const td = node('td');
        if (content instanceof Node) td.append(content);
        else td.textContent = String(content ?? '—');
        row.append(td);
        return td;
    }

    function identity(title, subtitle, mono = false) {
        const result = node('div');
        result.append(node('span', title || 'Unnamed', 'access-cell-title'));
        if (subtitle) result.append(node('span', subtitle, 'access-cell-subtitle' + (mono ? ' access-mono' : '')));
        return result;
    }

    function badge(value) {
        const allowed = ['active', 'approved', 'pending', 'suspended', 'rejected'];
        return node('span', value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown', 'access-badge ' + (allowed.includes(value) ? value : ''));
    }

    function formatDate(value) {
        if (!value) return 'Not yet';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    }

    function isSelf(user) { return String(user.userID) === String(state.actor?.userID); }
    function companyById(id) { return state.companies.find(company => String(company.id) === String(id)); }
    function userName(user) { return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'User'; }
    function matching(text, query) { return String(text || '').toLowerCase().includes(query.trim().toLowerCase()); }

    function notice(message, error = false) {
        $('accessNotice').textContent = message;
        $('accessNotice').className = 'access-notice' + (error ? ' error' : '');
        $('accessNotice').hidden = false;
    }

    async function api(path, method = 'GET', payload) {
        let response;
        try {
            response = await fetch('/api/v1/admin/' + path, {
                method,
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { Accept: 'application/json', ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
                ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
            });
        } catch (_) {
            throw new Error('Unable to reach ProQ Pilot. Check your connection and try again.');
        }
        if (response.status === 401) {
            window.location.replace('/signin.html?error=session_expired&redirect=' + encodeURIComponent(window.location.pathname));
            throw new Error('Your session has expired. Please sign in again.');
        }
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.status !== 'success') {
            throw new Error(result?.message || (response.status === 403 ? 'You no longer have permission to manage access.' : 'The change could not be completed. Please try again.'));
        }
        return result.data;
    }

    async function load() {
        if (state.loading) return;
        state.loading = true;
        document.querySelectorAll('[data-refresh]').forEach(item => { item.disabled = true; });
        try {
            const data = await api('access');
            for (const key of ['companies', 'users', 'requests', 'audit']) state[key] = Array.isArray(data[key]) ? data[key] : [];
            $('accessLoadState').hidden = true;
            $('accessContent').hidden = false;
            if (page === 'companies') {
                $('addCompany').disabled = false;
                renderCompanies();
            } else {
                $('addUser').disabled = state.companies.length === 0;
                $('addUser').title = state.companies.length ? '' : 'Add a company before adding its users.';
                updateCompanyFilter();
                renderUsers();
                renderRequests();
                renderAudit();
            }
            return true;
        } catch (error) {
            if ($('accessContent').hidden) {
                const target = $('accessLoadState');
                target.replaceChildren(node('p', error.message), button('Try again', load));
            } else {
                notice(error.message, true);
            }
            return false;
        } finally {
            state.loading = false;
            document.querySelectorAll('[data-refresh]').forEach(item => { item.disabled = false; });
        }
    }

    function renderCompanies() {
        $('companyTotal').textContent = state.companies.length;
        $('companyActive').textContent = state.companies.filter(company => company.status === 'active').length;
        $('companyUsers').textContent = state.users.filter(user => user.accessStatus === 'approved').length;
        const search = $('companySearch').value;
        const type = $('companyTypeFilter').value;
        const status = $('companyStatusFilter').value;
        const companies = state.companies.filter(company => matching([company.name, company.tenantId, company.contactEmail].join(' '), search) && (!type || company.type === type) && (!status || company.status === status));
        $('companyRows').replaceChildren();
        $('companyTableCount').textContent = companies.length + ' of ' + state.companies.length + ' companies';
        $('companyEmpty').hidden = companies.length > 0;
        $('companyEmpty').textContent = state.companies.length ? 'No companies match these filters.' : 'No companies yet. Add your first company to start managing access.';
        companies.forEach(company => {
            const row = node('tr');
            cell(row, identity(company.name, company.tenantId, true));
            cell(row, company.type === 'admin' ? 'Admin / staff' : 'Client / customer');
            cell(row, badge(company.status));
            cell(row, company.userCount ?? state.users.filter(user => String(user.companyId) === String(company.id)).length);
            cell(row, company.contactEmail || '—');
            const actions = node('div', null, 'access-row-actions');
            const edit = button('Manage', () => companyDialog(company));
            edit.setAttribute('aria-label', 'Manage ' + company.name);
            const users = node('a', 'Users', 'access-button');
            users.href = 'admin_users.html?company=' + encodeURIComponent(company.id);
            users.setAttribute('aria-label', 'View users at ' + company.name);
            actions.append(edit, users);
            cell(row, actions);
            $('companyRows').append(row);
        });
    }

    function updateCompanyFilter() {
        const select = $('userCompanyFilter');
        const selected = select.dataset.loaded ? select.value : new URLSearchParams(window.location.search).get('company') || '';
        select.replaceChildren(new Option('All companies', ''));
        state.companies.forEach(company => select.add(new Option(company.name, company.id)));
        select.value = selected;
        if (select.selectedIndex < 0) select.value = '';
        select.dataset.loaded = 'true';
    }

    function renderUsers() {
        $('userPending').textContent = state.requests.filter(request => request.status === 'pending').length;
        $('userApproved').textContent = state.users.filter(user => user.accessStatus === 'approved').length;
        $('userPurchasing').textContent = state.users.filter(user => user.canPurchase && user.accessStatus === 'approved' && companyById(user.companyId)?.status === 'active').length;
        const search = $('userSearch').value;
        const company = $('userCompanyFilter').value;
        const status = $('userStatusFilter').value;
        const role = $('userRoleFilter').value;
        const users = state.users.filter(user => matching([userName(user), user.email, user.companyName].join(' '), search) && (!company || String(user.companyId) === company) && (!status || user.accessStatus === status) && (!role || user.role === role));
        $('userRows').replaceChildren();
        $('userTableCount').textContent = users.length + ' of ' + state.users.length + ' users';
        $('userEmpty').hidden = users.length > 0;
        $('userEmpty').textContent = state.users.length ? 'No users match these filters.' : 'No users yet. Approve a Microsoft sign-in request or add a user to get started.';
        users.forEach(user => {
            const row = node('tr');
            cell(row, identity(userName(user) + (isSelf(user) ? ' (you)' : ''), user.email));
            const company = companyById(user.companyId);
            cell(row, identity(user.companyName || company?.name || 'No company', company?.status === 'suspended' ? 'Company suspended' : ''));
            cell(row, user.role === 'admin' ? 'Platform admin' : 'Client / customer');
            cell(row, badge(user.accessStatus));
            cell(row, user.canPurchase ? 'Allowed' : 'Browse only');
            const actions = node('div', null, 'access-row-actions');
            const edit = button('Manage', () => userDialog(user));
            edit.setAttribute('aria-label', 'Manage ' + userName(user));
            const revoke = button('Sign out sessions', async () => {
                if (!window.confirm('Sign out all sessions for ' + userName(user) + '? They will need to sign in with Microsoft again.' + (isSelf(user) ? ' This will also sign you out.' : ''))) return;
                revoke.disabled = true;
                try {
                    await api('users/' + encodeURIComponent(user.userID) + '/revoke-sessions', 'POST', {});
                    if (isSelf(user)) {
                        await window.ProQSession.refresh();
                        window.location.replace('/signin.html');
                        return;
                    }
                    await load();
                    notice('Sessions signed out for ' + userName(user) + '.');
                } catch (error) { notice(error.message, true); }
                finally { revoke.disabled = false; }
            });
            revoke.setAttribute('aria-label', 'Sign out all sessions for ' + userName(user));
            actions.append(edit, revoke);
            cell(row, actions);
            $('userRows').append(row);
        });
    }

    function renderRequests() {
        const requests = state.requests.filter(request => request.status === 'pending');
        $('pendingCount').textContent = requests.length;
        $('requestRows').replaceChildren();
        $('requestEmpty').hidden = requests.length > 0;
        $('requestTable').hidden = requests.length === 0;
        requests.forEach(request => {
            const row = node('tr');
            cell(row, identity(request.displayName || request.email, request.email));
            cell(row, request.companyName || companyById(request.companyId)?.name || 'Unknown company');
            cell(row, formatDate(request.createdAt));
            const actions = node('div', null, 'access-row-actions');
            const review = button('Review & approve', () => approvalDialog(request), 'primary');
            review.setAttribute('aria-label', 'Review request from ' + (request.displayName || request.email));
            const reject = button('Reject', async () => {
                if (!window.confirm('Reject the access request from ' + (request.displayName || request.email) + '? This person will not gain access to ProQ Pilot.')) return;
                reject.disabled = true;
                try { await api('access-requests/' + encodeURIComponent(request.id) + '/reject', 'POST', {}); await load(); notice('Access request rejected.'); }
                catch (error) { notice(error.message, true); }
                finally { reject.disabled = false; }
            }, 'danger');
            reject.setAttribute('aria-label', 'Reject request from ' + (request.displayName || request.email));
            actions.append(review, reject);
            cell(row, actions);
            $('requestRows').append(row);
        });
    }

    function renderAudit() {
        $('auditRows').replaceChildren();
        $('auditEmpty').hidden = state.audit.length > 0;
        state.audit.forEach(entry => {
            const row = node('tr');
            cell(row, String(entry.action || 'Access updated').replace(/[_.-]/g, ' '));
            cell(row, entry.actorEmail || 'System');
            const target = entry.targetType === 'company' ? companyById(entry.targetId)?.name : entry.targetType === 'user' ? userName(state.users.find(user => String(user.userID) === String(entry.targetId)) || {}) : null;
            cell(row, target || [entry.targetType, entry.targetId].filter(Boolean).join(' '));
            cell(row, formatDate(entry.createdAt));
            $('auditRows').append(row);
        });
    }

    function openDialog(title, description, saveLabel) {
        returnFocus = document.activeElement;
        $('dialogTitle').textContent = title;
        $('dialogDescription').textContent = description;
        $('dialogSave').textContent = saveLabel;
        $('formFields').replaceChildren();
        $('formIntro').replaceChildren();
        $('formError').hidden = true;
        $('accessForm').reset();
    }

    function showDialog() {
        $('accessDialog').showModal();
        const firstField = $('formFields').querySelector('input:not(:disabled),select:not(:disabled)');
        if (firstField) firstField.focus();
    }

    function closeDialog() {
        if (state.saving) return;
        $('accessDialog').close();
    }

    function field(name, label, value, options = {}) {
        const wrapper = node('div', null, 'access-field' + (options.full ? ' full-width' : ''));
        const labelElement = node('label', label);
        const id = 'access-' + name;
        labelElement.htmlFor = id;
        const input = node(options.choices ? 'select' : options.multiline ? 'textarea' : 'input');
        input.id = id;
        input.name = name;
        if (options.choices) options.choices.forEach(choice => input.add(new Option(choice[1], choice[0])));
        else if (!options.multiline) input.type = options.type || 'text';
        input.value = value ?? '';
        input.required = Boolean(options.required);
        input.disabled = Boolean(options.disabled);
        if (options.readOnly) input.readOnly = true;
        if (options.pattern) input.pattern = options.pattern;
        if (options.maxLength) input.maxLength = options.maxLength;
        if (options.placeholder) input.placeholder = options.placeholder;
        if (options.autocomplete) input.autocomplete = options.autocomplete;
        wrapper.append(labelElement, input);
        if (options.help) {
            const help = node('small', options.help);
            help.id = id + '-help';
            input.setAttribute('aria-describedby', help.id);
            wrapper.append(help);
        }
        $('formFields').append(wrapper);
        return input;
    }

    function checkbox(name, label, checked) {
        const wrapper = node('div', null, 'access-checkbox access-field full-width');
        const input = node('input');
        input.type = 'checkbox';
        input.name = name;
        input.id = 'access-' + name;
        input.checked = Boolean(checked);
        const labelElement = node('label', label);
        labelElement.htmlFor = input.id;
        wrapper.append(input, labelElement);
        $('formFields').append(wrapper);
        return input;
    }

    function companyDialog(company) {
        const ownCompany = company && String(company.id) === String(state.actor.companyId);
        const linked = company && (Number(company.userCount) > 0 || state.users.some(user => String(user.companyId) === String(company.id)));
        openDialog(company ? 'Manage company' : 'Add company', company ? 'Update the organisation and its access to the platform.' : 'Register a Microsoft organisation before approving its people.', company ? 'Save company' : 'Create company');
        const fields = {
            name: field('name', 'Company name', company?.name, { required: true, maxLength: 180, full: true, autocomplete: 'organization' }),
            tenantId: field('tenantId', 'Microsoft tenant ID', company?.tenantId, { required: true, full: true, pattern: guidPattern, readOnly: linked, placeholder: '00000000-0000-0000-0000-000000000000', help: linked ? 'This tenant has linked users and cannot be changed. Create a new company for a different tenant.' : 'Ask the company’s Microsoft administrator for its tenant ID. This is an organisation identifier, not a secret.' }),
            type: field('type', 'Company type', company?.type || 'client', { choices: [['client', 'Client / customer'], ['admin', 'Admin / staff']], disabled: ownCompany, help: 'Only admin companies can contain platform administrators.' }),
            status: field('status', 'Company access', company?.status || 'active', { choices: [['active', 'Active'], ['suspended', 'Suspended']], disabled: ownCompany, help: ownCompany ? 'You cannot suspend or downgrade your own company.' : 'Suspending blocks access for everyone at this company.' }),
            contactEmail: field('contactEmail', 'Company contact email', company?.contactEmail, { type: 'email', maxLength: 254, full: true, autocomplete: 'email' }),
            notes: field('notes', 'Internal notes', company?.notes, { multiline: true, full: true, maxLength: 2000 })
        };
        saveAction = async () => {
            const payload = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value.trim()]));
            if (company && (payload.type !== company.type || payload.status !== company.status || payload.tenantId.toLowerCase() !== String(company.tenantId).toLowerCase())) {
                const changes = [];
                if (payload.status !== company.status) changes.push(payload.status === 'suspended' ? 'Suspend access for every user in this company.' : 'Restore access for approved users in this company.');
                if (payload.type !== company.type) changes.push('Change company type to ' + (payload.type === 'admin' ? 'Admin / staff.' : 'Client / customer.'));
                if (payload.tenantId.toLowerCase() !== String(company.tenantId).toLowerCase()) changes.push('Replace the Microsoft organisation linked to this company.');
                if (!window.confirm(changes.join('\n') + '\n\nSave these access changes for ' + company.name + '?')) return false;
            }
            await api('companies' + (company ? '/' + encodeURIComponent(company.id) : ''), company ? 'PATCH' : 'POST', payload);
            return company ? 'Company updated.' : 'Company created. Ask its users to sign in with Microsoft to request access.';
        };
        showDialog();
    }

    function userDialog(user) {
        const self = user && isSelf(user);
        openDialog(user ? 'Manage user' : 'Add user', user ? 'Control platform access, role and purchasing permission.' : 'Choose a company and prepare access for a Microsoft work account.', user ? 'Save user' : 'Create user');
        if (user) $('formIntro').append(node('p', 'Last sign-in: ' + formatDate(user.lastLoginAt) + '. Changes to this person’s identity or company sign out their sessions.', 'access-form-help'));
        const fields = {
            firstName: field('firstName', 'First name', user?.firstName, { required: true, maxLength: 100, autocomplete: 'given-name' }),
            lastName: field('lastName', 'Last name', user?.lastName, { required: true, maxLength: 100, autocomplete: 'family-name' }),
            email: field('email', 'Email address', user?.email, { required: true, type: 'email', maxLength: 254, autocomplete: 'email' }),
            contact: field('contact', 'Contact number (optional)', user?.contact, { type: 'tel', maxLength: 40, autocomplete: 'tel' }),
            companyId: field('companyId', 'Company', user?.companyId || '', { required: true, disabled: self, full: true, choices: [['', 'Select a company'], ...state.companies.map(company => [company.id, company.name + (company.status === 'suspended' ? ' (suspended)' : '')])], help: 'The Microsoft tenant is determined by the selected company.' }),
            role: field('role', 'Platform role', user?.role || 'client', { disabled: self, choices: [['client', 'Client / customer'], ['admin', 'Platform admin']], help: 'Platform admins can manage all companies and users.' }),
            accessStatus: field('accessStatus', 'Access status', user?.accessStatus || 'pending', { disabled: self, choices: [['pending', 'Pending approval'], ['approved', 'Approved'], ['suspended', 'Suspended']], help: self ? 'You cannot remove your own admin access.' : 'Only approved users at active companies can enter the platform.' }),
            microsoftObjectId: field('microsoftObjectId', 'Microsoft user object ID', user?.microsoftObjectId, { full: true, pattern: guidPattern, placeholder: '00000000-0000-0000-0000-000000000000', help: 'Required for approved access. To avoid entering this manually, leave the user pending and link their verified sign-in request from Pending approvals.' })
        };
        const purchasing = checkbox('canPurchase', 'Allow this user to purchase products', user ? user.canPurchase : true);
        const updateRules = () => {
            const company = companyById(fields.companyId.value);
            fields.role.options[1].disabled = company?.type !== 'admin';
            if (company?.type !== 'admin' && !self) fields.role.value = 'client';
            fields.microsoftObjectId.required = fields.accessStatus.value === 'approved';
        };
        fields.companyId.addEventListener('change', updateRules);
        fields.accessStatus.addEventListener('change', updateRules);
        updateRules();
        saveAction = async () => {
            const payload = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value.trim()]));
            payload.canPurchase = purchasing.checked;
            const impact = [];
            if (!user && payload.accessStatus === 'approved') impact.push('Grant approved access to this Microsoft identity.');
            if ((!user || user.role !== payload.role) && payload.role === 'admin') impact.push('Give this person platform administrator access to every company, user and product.');
            if (user) {
                if (payload.accessStatus !== user.accessStatus) impact.push('Change access from ' + user.accessStatus + ' to ' + payload.accessStatus + '.');
                if (payload.role !== user.role) impact.push('Change platform role to ' + payload.role + '.');
                if (payload.canPurchase !== Boolean(user.canPurchase)) impact.push(payload.canPurchase ? 'Allow purchasing.' : 'Remove purchasing permission.');
                if (String(payload.companyId) !== String(user.companyId) || payload.microsoftObjectId.toLowerCase() !== String(user.microsoftObjectId || '').toLowerCase() || payload.email.toLowerCase() !== String(user.email).toLowerCase()) impact.push('Change the linked identity or company and sign out existing sessions.');
            }
            if (impact.length && !window.confirm(impact.join('\n') + '\n\nSave these access changes?')) return false;
            await api('users' + (user ? '/' + encodeURIComponent(user.userID) : ''), user ? 'PATCH' : 'POST', payload);
            return user ? 'User access updated.' : 'User created.';
        };
        showDialog();
    }

    function approvalDialog(request) {
        const company = companyById(request.companyId);
        openDialog('Approve Microsoft access', 'Review the verified identity and choose the permissions to grant.', 'Approve access');
        const identityPanel = node('div', null, 'access-identity');
        identityPanel.append(node('strong', request.displayName || request.email), node('p', request.email || 'Microsoft did not provide an email address'), node('p', request.companyName || company?.name), node('p', 'Tenant: ' + request.tenantId, 'access-mono'), node('p', 'User object: ' + request.objectId, 'access-mono'));
        $('formIntro').append(identityPanel);
        const existing = field('userID', 'Portal account', '', { full: true, choices: [['', 'Create a new user'], ...state.users.filter(user => user.companyId == null || String(user.companyId) === String(request.companyId)).map(user => [user.userID, userName(user) + ' — ' + user.email + (user.companyId == null ? ' (unassigned)' : '')])], help: 'Select an existing account only when you have verified this is the same person. Email addresses are never automatically linked. Unassigned accounts can be migrated into this company.' });
        const email = field('email', 'Contact email', request.email || '', { type: 'email', required: true, maxLength: 254, full: true, help: 'Required for a new user. Microsoft may not provide an email address; confirm it with the person if it is missing.' });
        const role = field('role', 'Platform role', 'client', { full: true, choices: [['client', 'Client / customer'], ...(company?.type === 'admin' ? [['admin', 'Platform admin']] : [])] });
        const purchase = checkbox('canPurchase', 'Allow this user to purchase products', true);
        const warning = node('p', 'Linking grants this Microsoft identity access to the existing account and its order history. Verify the person before continuing.', 'access-warning');
        warning.hidden = true;
        $('formIntro').append(warning);
        existing.addEventListener('change', () => {
            warning.hidden = !existing.value;
            email.required = !existing.value;
            email.disabled = Boolean(existing.value);
            const user = state.users.find(item => String(item.userID) === existing.value);
            if (user) {
                role.value = user.role;
                purchase.checked = Boolean(user.canPurchase);
            }
        });
        saveAction = async () => {
            const selected = state.users.find(user => String(user.userID) === existing.value);
            const message = 'Approve ' + (request.displayName || request.email) + ' at ' + (company?.name || request.companyName) + '?' + (role.value === 'admin' ? '\nThis grants platform administrator access to all companies and users.' : '') + (selected ? '\nThis links the Microsoft identity to ' + selected.email + ' and grants access to that account’s order history.' : '') + '\nPurchasing: ' + (purchase.checked ? 'allowed.' : 'browse only.');
            if (!window.confirm(message)) return false;
            await api('access-requests/' + encodeURIComponent(request.id) + '/approve', 'POST', { role: role.value, canPurchase: purchase.checked, ...(existing.value ? { userID: existing.value } : { email: email.value.trim() }) });
            return 'Access approved. This person can now sign in with Microsoft.';
        };
        showDialog();
    }

    $('dialogClose').addEventListener('click', closeDialog);
    $('dialogCancel').addEventListener('click', closeDialog);
    $('accessDialog').addEventListener('cancel', event => { if (state.saving) event.preventDefault(); });
    $('accessDialog').addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
    $('accessForm').addEventListener('submit', async event => {
        event.preventDefault();
        if (state.saving || !saveAction) return;
        state.saving = true;
        $('formError').hidden = true;
        const controls = Array.from($('accessDialog').querySelectorAll('input,select,textarea,button'));
        const disabledStates = controls.map(control => control.disabled);
        controls.forEach(control => { control.disabled = true; });
        const saveLabel = $('dialogSave').textContent;
        $('dialogSave').textContent = 'Saving…';
        try {
            const message = await saveAction();
            if (message) {
                state.saving = false;
                closeDialog();
                const refreshed = await load();
                notice(message + (refreshed ? '' : ' Refresh the directory to see the latest details.'), !refreshed);
            }
        } catch (error) {
            $('formError').textContent = error.message;
            $('formError').hidden = false;
            $('formError').scrollIntoView({ block: 'nearest' });
        } finally {
            state.saving = false;
            controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
            $('dialogSave').textContent = saveLabel;
        }
    });

    document.querySelectorAll('[data-refresh]').forEach(control => control.addEventListener('click', load));
    if (page === 'companies') {
        $('addCompany').addEventListener('click', () => companyDialog());
        ['companySearch', 'companyTypeFilter', 'companyStatusFilter'].forEach(id => $(id).addEventListener('input', renderCompanies));
    } else {
        $('addUser').addEventListener('click', () => userDialog());
        ['userSearch', 'userCompanyFilter', 'userStatusFilter', 'userRoleFilter'].forEach(id => $(id).addEventListener('input', renderUsers));
    }

    (async () => {
        try {
            if (!window.ProQSession) throw new Error('The sign-in service could not load. Refresh this page to try again.');
            state.actor = await window.ProQSession.ready;
            if (!state.actor) {
                window.location.replace('/signin.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search));
                return;
            }
            if (state.actor.role !== 'admin') {
                $('accessLoadState').replaceChildren(node('p', 'Platform administrator access is required to manage companies and users.'));
                const store = node('a', 'Return to the store', 'access-button');
                store.href = 'store.html';
                $('accessLoadState').append(store);
                return;
            }
            $('accessLoadState').textContent = 'Loading companies and access…';
            await load();
        } catch (error) {
            $('accessLoadState').textContent = error.message;
        }
    })();
})();
