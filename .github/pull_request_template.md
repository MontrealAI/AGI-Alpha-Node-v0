# Pull Request Checklist

## Summary

- [ ] Summary explains the user-facing change and links relevant issues.

## Testing

- [ ] `npm run ci:lint`
- [ ] `npm run ci:test`
- [ ] `npm run ci:coverage`
- [ ] Documented additional manual or integration testing.

## Deployment

- [ ] Operator docs updated if deployment steps changed.
- [ ] Validated Helm chart with `helm lint deploy/helm/agi-alpha-node` when relevant.

## Additional Notes

Add reviewer context, follow-up work, or dashboard links here.
