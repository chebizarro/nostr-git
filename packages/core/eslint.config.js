import ts from 'typescript-eslint';

export default [
	{
		languageOptions: {
			parser: ts.parser
		},
		rules: {
			// Enforce canonical tag helpers instead of direct event.tags find/filter
			'no-restricted-syntax': [
				'error',
				{
					selector:
						"CallExpression[callee.type='MemberExpression'][callee.property.name=/^(find|filter)$/] > *.object[type='MemberExpression'][property.name='tags']",
					message:
						"Do not use event.tags.find/filter directly. Use getTag/getTags/getTagValue from @nostr-git/shared-types."
				}
			]
		}
	}
];
