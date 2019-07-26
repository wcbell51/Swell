import React, { Component } from 'react';
import { connect } from "react-redux";
import * as actions from '../../../actions/actions';
import GraphQLBodyTypeSelect from './GraphQLBodyTypeSelect.jsx';

const mapStateToProps = store => ({
  newRequestBody: store.business.newRequestBody,
});

const mapDispatchToProps = dispatch => ({
  setNewRequestBody: (requestBodyObj) => {
    dispatch(actions.setNewRequestBody(requestBodyObj));
  },
});

class GraphQLBodyEntryForm extends Component {
  constructor(props) {
    super(props);
    this.state = {
      show: true,
    };
    this.toggleShow = this.toggleShow.bind(this);
  }

  toggleShow() {
    this.setState({
      show: !this.state.show
    });
  }

  render() {
    console.log("INSIDE THE GRAPHQLBodyEntryForm ", this.props.newRequestBody)
    const num = this.props.newRequestBody.bodyType === 'GQLraw' ? 10 : 5;

    const textArea = <textarea
      value={this.props.newRequestBody.bodyContent}
      className={'composer_textarea'}
      style={{ 'resize': 'none' }} //tried making top-margin/topMargin -10px but it didn't care
      type='text'
      placeholder='Body'
      rows={num}
      onChange={(e) => {
        this.props.setNewRequestBody({
          ...this.props.newRequestBody,
          bodyContent: e.target.value
        })
      }}
    ></textarea>

    const secondTextArea = <textarea
      value={this.props.newRequestBody.bodyVariables}
      className={'composer_textarea'}
      style={{ 'resize': 'none' }} //tried making top-margin/topMargin -10px but it didn't care
      type='text'
      placeholder='Variables'
      rows={num}
      onChange={(e) => {
        this.props.setNewRequestBody({
          ...this.props.newRequestBody,
          bodyVariables: e.target.value
        })
      }}
    ></textarea>

    return (
      <div >
        <div className='composer_subtitle' >
          Body
        </div>
        <GraphQLBodyTypeSelect setNewRequestBody={this.props.setNewRequestBody} newRequestBody={this.props.newRequestBody} />

        {textArea}
        {
          this.props.newRequestBody.bodyType === 'GQLvariables' &&
          secondTextArea
        }
      </div>
    );
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(GraphQLBodyEntryForm);
