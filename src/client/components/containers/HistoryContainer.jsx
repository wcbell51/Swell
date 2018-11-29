import React, { Component } from 'react';
import { connect } from 'react-redux';
import * as actions from '../../actions/actions';
import HistoryDate from '../display/HistoryDate.jsx'

const mapStateToProps = store => ({
  history : store.business.history,
});

const mapDispatchToProps = dispatch => ({
});

class HistoryContainer extends Component {
  constructor(props) {
    super(props);
  }

  render() {

    let historyDates = this.props.history.map((date, i) => {
      return <HistoryDate className="historyDate" content={date} key={i}></HistoryDate>
    })

    return(
      <div>
        {historyDates}
      </div>
    )
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(HistoryContainer);