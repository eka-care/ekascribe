import AlertComponent from '@/shared-components/alert/alert-component';
import useVoice2RxStore from '@/store/store';

const WarningAlert = () => {
  const warningMessage = useVoice2RxStore((state) => state.warningMessage);
  const WarningIcon = useVoice2RxStore((state) => state.warningIcon);
  const WarningAction = useVoice2RxStore((state) => state.warningAction);
  const warningListHeader = useVoice2RxStore((state) => state.warningListHeader);
  const warningListItems = useVoice2RxStore((state) => state.warningListItems);
  const warningType = useVoice2RxStore((state) => state.warningType);

  if (!warningMessage) return null;

  return (
    <AlertComponent
      message={warningMessage}
      Icon={WarningIcon}
      ActionComponent={WarningAction}
      listHeader={warningListHeader}
      listItems={warningListItems}
      type={warningType || 'warning'}
    />
  );
};

export default WarningAlert;
